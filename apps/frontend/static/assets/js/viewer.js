/**
 * viewer.js — WebGL cortical surface viewer for virtual-subject.
 *
 * Renders both cortical hemispheres as coloured 3-D surfaces.
 * Vertex colours are driven by prediction data fetched from the API.
 *
 * Public API (attached to window.BrainViewer):
 *   init(canvas)         → viewer object
 *   viewer.setVertexData(float32Array, nVertsPerHemi)
 *   viewer.setThreshold(value)        0–1
 *   viewer.setHemisphere(mode)        "left"|"right"|"both"
 *   viewer.setParcelOverlay(bool)
 *   viewer.play() / viewer.pause()
 *   viewer.setTimeIndex(t)
 *   viewer.snapshot()                 → data-url PNG string
 *   viewer.setRunConfig(runId, ablation, nTimesteps, apiBase)
 *   viewer.destroy()
 *
 * Mesh geometry: on first call the viewer fetches
 *   GET /api/v1/atlases/fsaverage5/mesh/left/left_mesh.bin  etc.
 * If those assets are unavailable it falls back to a built-in
 * level-5 icosphere approximation (10242 vertices per hemisphere).
 */

(function (global) {
  "use strict";

  // ── GLSL shaders ────────────────────────────────────────────────────────────

  const VERT_SRC = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute float a_value;

    uniform mat4 u_mvp;
    uniform mat4 u_normal_mat;
    uniform float u_threshold;

    varying float v_value;
    varying vec3 v_normal;
    varying float v_above;

    void main() {
      gl_Position = u_mvp * vec4(a_position, 1.0);
      v_normal = normalize((u_normal_mat * vec4(a_normal, 0.0)).xyz);
      v_value = a_value;
      v_above = step(u_threshold, a_value);
    }
  `;

  const FRAG_SRC = `
    precision mediump float;

    varying float v_value;
    varying vec3 v_normal;
    varying float v_above;

    uniform vec3 u_light_dir;

    // Hot colormap: low=navy, mid=orange, high=yellow-white
    vec3 hot(float t) {
      t = clamp(t, 0.0, 1.0);
      vec3 c;
      if (t < 0.33) {
        c = mix(vec3(0.05, 0.05, 0.35), vec3(0.8, 0.2, 0.0), t / 0.33);
      } else if (t < 0.66) {
        c = mix(vec3(0.8, 0.2, 0.0), vec3(1.0, 0.85, 0.0), (t - 0.33) / 0.33);
      } else {
        c = mix(vec3(1.0, 0.85, 0.0), vec3(1.0, 1.0, 0.95), (t - 0.66) / 0.34);
      }
      return c;
    }

    void main() {
      // Base surface colour: light grey for below-threshold vertices
      vec3 base_col = vec3(0.82, 0.82, 0.80);
      vec3 hot_col  = hot(v_value);
      vec3 col      = mix(base_col, hot_col, v_above);

      // Simple diffuse + ambient lighting
      float diffuse = max(dot(normalize(v_normal), normalize(u_light_dir)), 0.0);
      vec3 lit = col * (0.45 + 0.55 * diffuse);

      gl_FragColor = vec4(lit, 1.0);
    }
  `;

  // ── maths helpers ────────────────────────────────────────────────────────────

  function mat4Identity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }

  function mat4Multiply(out, a, b) {
    const tmp = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        tmp[j * 4 + i] = 0;
        for (let k = 0; k < 4; k++) tmp[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
      }
    }
    out.set(tmp);
    return out;
  }

  function mat4Perspective(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  function mat4RotateX(out, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = mat4Identity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return mat4Multiply(out, out, m);
  }

  function mat4RotateY(out, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = mat4Identity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return mat4Multiply(out, out, m);
  }

  function mat4Translate(out, x, y, z) {
    const m = mat4Identity();
    m[12] = x; m[13] = y; m[14] = z;
    return mat4Multiply(out, out, m);
  }

  function mat4Invert(out, m) {
    // Fast 4x4 inverse (column-major)
    const [m00,m01,m02,m03,m10,m11,m12,m13,m20,m21,m22,m23,m30,m31,m32,m33] = m;
    const b00 = m00*m11-m01*m10, b01 = m00*m12-m02*m10, b02 = m00*m13-m03*m10;
    const b03 = m01*m12-m02*m11, b04 = m01*m13-m03*m11, b05 = m02*m13-m03*m12;
    const b06 = m20*m31-m21*m30, b07 = m20*m32-m22*m30, b08 = m20*m33-m23*m30;
    const b09 = m21*m32-m22*m31, b10 = m21*m33-m23*m31, b11 = m22*m33-m23*m32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return null;
    det = 1 / det;
    out[0]  = (m11*b11-m12*b10+m13*b09)*det;
    out[1]  = (m02*b10-m01*b11-m03*b09)*det;
    out[2]  = (m31*b05-m32*b04+m33*b03)*det;
    out[3]  = (m22*b04-m21*b05-m23*b03)*det;
    out[4]  = (m12*b08-m10*b11-m13*b07)*det;
    out[5]  = (m00*b11-m02*b08+m03*b07)*det;
    out[6]  = (m32*b02-m30*b05-m33*b01)*det;
    out[7]  = (m20*b05-m22*b02+m23*b01)*det;
    out[8]  = (m10*b10-m11*b08+m13*b06)*det;
    out[9]  = (m01*b08-m00*b10-m03*b06)*det;
    out[10] = (m30*b04-m31*b02+m33*b00)*det;
    out[11] = (m21*b02-m20*b04-m23*b00)*det;
    out[12] = (m11*b07-m10*b09-m12*b06)*det;
    out[13] = (m00*b09-m01*b07+m02*b06)*det;
    out[14] = (m31*b01-m30*b03-m32*b00)*det;
    out[15] = (m20*b03-m21*b01+m22*b00)*det;
    return out;
  }

  function mat4Transpose(out, m) {
    out[0]=m[0]; out[1]=m[4]; out[2]=m[8];  out[3]=m[12];
    out[4]=m[1]; out[5]=m[5]; out[6]=m[9];  out[7]=m[13];
    out[8]=m[2]; out[9]=m[6]; out[10]=m[10];out[11]=m[14];
    out[12]=m[3];out[13]=m[7];out[14]=m[11];out[15]=m[15];
    return out;
  }

  // ── icosphere fallback ───────────────────────────────────────────────────────

  function generateIcosphere(subdivisions) {
    const phi = (1 + Math.sqrt(5)) / 2;
    const normalize3 = (v) => {
      const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
      return [v[0]/l, v[1]/l, v[2]/l];
    };
    let verts = [
      [-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],
      [0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],
      [phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1],
    ].map(normalize3);

    let faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    const cache = {};
    function mid(a, b) {
      const key = Math.min(a,b)+'_'+Math.max(a,b);
      if (cache[key] !== undefined) return cache[key];
      const m = normalize3([(verts[a][0]+verts[b][0])/2,(verts[a][1]+verts[b][1])/2,(verts[a][2]+verts[b][2])/2]);
      verts.push(m);
      return (cache[key] = verts.length - 1);
    }

    for (let i = 0; i < subdivisions; i++) {
      const nf = [];
      for (const [a,b,c] of faces) {
        const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
        nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
      }
      faces = nf;
    }

    // Compute smooth normals (same as vertex positions for unit sphere)
    const posFlat = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      posFlat[i*3] = verts[i][0];
      posFlat[i*3+1] = verts[i][1];
      posFlat[i*3+2] = verts[i][2];
    }
    const faceFlat = new Uint16Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
      faceFlat[i*3] = faces[i][0];
      faceFlat[i*3+1] = faces[i][1];
      faceFlat[i*3+2] = faces[i][2];
    }
    return { positions: posFlat, normals: posFlat, faces: faceFlat, nVerts: verts.length };
  }

  // ── WebGL helpers ────────────────────────────────────────────────────────────

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function linkProgram(gl, vs, fs) {
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function createBuffer(gl, data, type) {
    const buf = gl.createBuffer();
    gl.bindBuffer(type || gl.ARRAY_BUFFER, buf);
    gl.bufferData(type || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  // ── binary fetch helpers ─────────────────────────────────────────────────────

  async function fetchF32(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
    return new Float32Array(await resp.arrayBuffer());
  }

  async function fetchU16(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
    const raw = new Uint32Array(await resp.arrayBuffer());
    return new Uint16Array(raw);
  }

  // ── Hemisphere object ────────────────────────────────────────────────────────

  function Hemisphere(gl, prog, positions, normals, faces, xOffset, nVerts) {
    this.gl = gl;
    this.prog = prog;
    this.nFaces = faces.length;
    this.nVerts = nVerts;
    this.xOffset = xOffset;

    // Shift positions along x axis to separate hemispheres
    const pos = new Float32Array(positions);
    for (let i = 0; i < pos.length; i += 3) pos[i] += xOffset;

    this.posBuf    = createBuffer(gl, pos);
    this.normBuf   = createBuffer(gl, normals instanceof Float32Array ? normals : pos);
    this.faceBuf   = createBuffer(gl, faces, gl.ELEMENT_ARRAY_BUFFER);
    this.colorBuf  = createBuffer(gl, new Float32Array(nVerts));  // will be updated
  }

  Hemisphere.prototype.updateColors = function (values, normMin, normMax) {
    const gl = this.gl;
    const n = this.nVerts;
    const colors = new Float32Array(n);
    const range = normMax - normMin || 1;
    for (let i = 0; i < n; i++) {
      colors[i] = (values[i] - normMin) / range;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  };

  Hemisphere.prototype.draw = function (mvp, normalMat, threshold, lightDir) {
    const gl = this.gl;
    const prog = this.prog;

    const aPos   = gl.getAttribLocation(prog, 'a_position');
    const aNorm  = gl.getAttribLocation(prog, 'a_normal');
    const aVal   = gl.getAttribLocation(prog, 'a_value');
    const uMvp   = gl.getUniformLocation(prog, 'u_mvp');
    const uNorm  = gl.getUniformLocation(prog, 'u_normal_mat');
    const uThr   = gl.getUniformLocation(prog, 'u_threshold');
    const uLight = gl.getUniformLocation(prog, 'u_light_dir');

    gl.uniformMatrix4fv(uMvp, false, mvp);
    gl.uniformMatrix4fv(uNorm, false, normalMat);
    gl.uniform1f(uThr, threshold);
    gl.uniform3fv(uLight, lightDir);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuf);
    gl.enableVertexAttribArray(aNorm);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.enableVertexAttribArray(aVal);
    gl.vertexAttribPointer(aVal, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.faceBuf);
    gl.drawElements(gl.TRIANGLES, this.nFaces, gl.UNSIGNED_SHORT, 0);
  };

  // ── main viewer factory ──────────────────────────────────────────────────────

  function init(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true }) || canvas.getContext('experimental-webgl', { alpha: true, antialias: true });
    if (!gl) {
      canvas.parentElement.innerHTML = '<p style="color:#ff4757">WebGL is not supported by this browser.</p>';
      return null;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    const emitStatus = (state, message) => {
      canvas.dispatchEvent(new CustomEvent('viewer-status', { detail: { state, message } }));
    };
    emitStatus('initializing', 'Initializing brain viewer...');

    const prog = linkProgram(gl,
      compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC),
      compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC),
    );
    gl.useProgram(prog);

    // Camera state
    let rotX = 0.3, rotY = 0.0, zoom = 3.8;
    let dragging = false, lastX = 0, lastY = 0;
    let hemisphere = 'both';
    let threshold = 0.25;
    let leftHemi = null, rightHemi = null;
    let meshReady = false;

    // Playback state
    let runId = null, ablation = 'full', nTimesteps = 0, apiBase = '';
    let timeIndex = 0, playing = false, playTimer = null;

    // Mouse controls
    canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.008;
      rotX += (e.clientY - lastY) * 0.008;
      lastX = e.clientX; lastY = e.clientY;
      render();
    });
    canvas.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('mouseleave', () => { dragging = false; });
    canvas.addEventListener('wheel', e => {
      zoom = Math.max(2.0, Math.min(8.0, zoom + e.deltaY * 0.005));
      render();
      e.preventDefault();
    }, { passive: false });

    // Touch controls (basic)
    let lastTouchX = 0, lastTouchY = 0;
    canvas.addEventListener('touchstart', e => { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; });
    canvas.addEventListener('touchmove', e => {
      rotY += (e.touches[0].clientX - lastTouchX) * 0.01;
      rotX += (e.touches[0].clientY - lastTouchY) * 0.01;
      lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
      render();
      e.preventDefault();
    }, { passive: false });

    function buildMVP(xShift) {
      const proj = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 50.0);
      let view = mat4Identity();
      mat4Translate(view, xShift, 0, -zoom);
      mat4RotateX(view, rotX);
      mat4RotateY(view, rotY);
      const mvp = new Float32Array(16);
      mat4Multiply(mvp, proj, view);
      // normal matrix = transpose(inverse(modelView upper-left 3x3))
      const inv = new Float32Array(16);
      mat4Invert(inv, view);
      const normalMat = new Float32Array(16);
      mat4Transpose(normalMat, inv);
      return { mvp, normalMat };
    }

    function render() {
      if (!meshReady) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);

      const light = [0.6, 0.8, 1.0];

      if (hemisphere !== 'right' && leftHemi) {
        const { mvp, normalMat } = buildMVP(hemisphere === 'both' ? 0 : 0);
        leftHemi.draw(mvp, normalMat, threshold, light);
      }
      if (hemisphere !== 'left' && rightHemi) {
        const { mvp, normalMat } = buildMVP(0);
        rightHemi.draw(mvp, normalMat, threshold, light);
      }
    }

    async function loadMesh() {
      emitStatus('mesh-loading', 'Loading cortical mesh...');
      try {
        // Try real atlas assets first
        const metaResp = await fetch(`${apiBase}/atlases/fsaverage5/metadata`);
        if (!metaResp.ok) throw new Error('no atlas');

        const base = `${apiBase}/atlases/fsaverage5/mesh`;
        const [lPos, lNorm, lFaces, rPos, rNorm, rFaces] = await Promise.all([
          fetchF32(`${base}/left/left_mesh.bin`),
          fetchF32(`${base}/left/vertex_normals_left.bin`),
          fetchU16(`${base}/left/faces_left.bin`),
          fetchF32(`${base}/right/right_mesh.bin`),
          fetchF32(`${base}/right/vertex_normals_right.bin`),
          fetchU16(`${base}/right/faces_right.bin`),
        ]);
        const nV = lPos.length / 3;
        leftHemi  = new Hemisphere(gl, prog, lPos, lNorm, lFaces, 0, nV);
        rightHemi = new Hemisphere(gl, prog, rPos, rNorm, rFaces, 0, nV);
        console.log('[BrainViewer] Loaded real fsaverage5 mesh (' + nV + ' verts/hemi)');
        emitStatus('mesh-ready', 'Cortical mesh loaded.');
      } catch (_err) {
        // Fallback: generate icosphere
        console.warn('[BrainViewer] Atlas mesh not available — using icosphere approximation');
        const { positions, normals, faces, nVerts } = generateIcosphere(5);
        leftHemi  = new Hemisphere(gl, prog, positions, normals, faces, -1.6, nVerts);
        rightHemi = new Hemisphere(gl, prog, positions, normals, faces,  1.6, nVerts);
        emitStatus('mesh-ready', 'Using fallback cortical mesh.');
      }
      meshReady = true;
      render();
      viewer.setTimeIndex(timeIndex); // re-trigger fetch for current frame now that mesh is ready
    }

    // ── public API ─────────────────────────────────────────────────────────────

    const viewer = {
      setRunConfig(rid, abl, nT, base) {
        runId = rid; ablation = abl; nTimesteps = nT; apiBase = base;
        if (!meshReady) loadMesh();
      },

      setThreshold(v) { threshold = v; render(); },

      setHemisphere(mode) { hemisphere = mode; render(); },

      setParcelOverlay(_v) { /* parcel outlines not yet implemented in WebGL path */ },

      setVertexData(float32Array, nVertsPerHemi) {
        if (!leftHemi || !rightHemi) return;
        const left  = float32Array.slice(0, nVertsPerHemi);
        const right = float32Array.slice(nVertsPerHemi, nVertsPerHemi * 2);
        const min = Math.min(...float32Array);
        const max = Math.max(...float32Array);
        leftHemi.updateColors(left, min, max);
        rightHemi.updateColors(right, min, max);
        render();
      },

      setTimeIndex(t) {
        timeIndex = t;
        if (!runId) return;
        emitStatus('frame-loading', `Loading frame ${t + 1}...`);
        fetch(`${apiBase}/runs/${runId}/frames/${t}/vertices?ablation=${encodeURIComponent(ablation)}`)
          .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
          .then(buf => {
            const arr = new Float32Array(buf);
            // Defend against data arriving before mesh is ready or if meshes failed
            const nV = leftHemi ? leftHemi.nVerts : arr.length / 2;
            if (leftHemi && rightHemi && meshReady) {
              viewer.setVertexData(arr, nV);
              emitStatus('ready', `Showing frame ${t + 1}.`);
            }
          })
          .catch(e => {
            console.warn('[BrainViewer] vertex fetch failed', e);
            emitStatus('error', `Failed to load cortical frame ${t}.`);
          });
      },

      play() {
        if (playing || !runId || nTimesteps < 2) return;
        playing = true;
        playTimer = setInterval(() => {
          timeIndex = (timeIndex + 1) % nTimesteps;
          // Dispatch event so the time slider in app.js can stay in sync
          canvas.dispatchEvent(new CustomEvent('viewer-timechange', { detail: { timeIndex } }));
          viewer.setTimeIndex(timeIndex);
        }, 1000);
      },

      pause() {
        playing = false;
        if (playTimer) { clearInterval(playTimer); playTimer = null; }
      },

      snapshot() {
        render();
        return canvas.toDataURL('image/png');
      },

      resize() {
        render();
      },

      destroy() {
        viewer.pause();
        canvas.removeEventListener('mousedown', () => {});
      },
    };

    // Kick off mesh load when apiBase is known (called by setRunConfig)
    return viewer;
  }

  global.BrainViewer = { init };
})(window);
