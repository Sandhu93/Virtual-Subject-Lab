# Portfolio Case Study: Building a Usable TRIBE v2 Research App

## Overview

This project began with a simple question:

Can a complex neuroscience research model be turned into a usable product workflow on a normal development setup?

I found the TRIBE v2 research paper and model, then spent a week trying to get it running locally in a form that was not just technically functional, but inspectable. The result is `virtual-subject`, a research-facing web application for submitting stimuli, running cortical-response prediction, and exploring the output through an interactive viewer.

## The Problem

Research code usually optimizes for experimental correctness, not usability.

That creates several practical gaps:

- model setup is fragile
- inference paths are hard to debug
- outputs are difficult to interpret
- there is no coherent workflow from input to insight

The challenge was not only to run TRIBE v2. The challenge was to make the model usable enough that a researcher, builder, or curious operator could inspect what it was doing.

## Goal

Build a local-first application that could:

- accept text, audio, or video stimuli
- run TRIBE-based prediction in `mock` or `real` mode
- display predicted cortical activity over time
- connect frames to aligned input evidence
- support comparison and export
- remain usable on constrained hardware

## Constraints

- local machine with a 6 GB GPU
- upstream model and dependency complexity
- multimodal inference paths that are much heavier than text
- need for a fallback experience when real inference is not practical

These constraints shaped the product architecture. Instead of forcing everything through one brittle path, the app supports both:

- `mock` mode for reliable end-to-end product testing
- `real` mode for actual TRIBE-backed inference where hardware allows it

## What I Built

### Product Workflow

The app now supports a coherent workflow:

1. Create a stimulus
2. Queue a run
3. Inspect predicted cortical activity in a 3D viewer
4. Scrub through time and view aligned frame evidence
5. Review ROI summaries and traces
6. Compare runs
7. Export reproducible artifacts

That workflow matters because the product is not just a wrapper around a model call. It is a complete inspection loop:

- create input
- queue asynchronous processing
- inspect time-based evidence
- compare outputs
- save artifacts for later review

### Technical System

The system is split into:

- a React frontend for the research workspace
- a FastAPI backend for stimuli, runs, analysis, and exports
- a Python worker for background run processing
- Postgres for metadata and job state
- MinIO or filesystem storage for larger artifacts
- adapters for TRIBE, atlas aggregation, and storage isolation

The adapter boundary was especially important. It let me keep the rest of the codebase stable while switching between:

- `MockTribeAdapter` for deterministic product testing
- `RealTribeAdapter` for actual TRIBE-backed inference

That design made it possible to keep building the product even when the real inference path was unstable.

### User Experience Improvements

On top of simply running inference, I improved the actual usability of the app:

- fixed a blank WebGL canvas issue in the cortical viewer
- added fullscreen mode for the brain viewer
- aligned frames to the corresponding text segment or token
- added in-canvas ROI HUD overlays in fullscreen mode
- simplified the page hierarchy so the workspace is easier to follow
- added delete support for stimuli and exports

## Key Technical Challenges

### 1. Making the Viewer Reliable

The viewer initially suffered from timing and rendering issues. Data could arrive before the mesh was ready, leaving the brain blank or visually inconsistent.

I resolved this by:

- synchronizing the first frame load with mesh readiness
- fixing rendering and matrix issues in the viewer
- improving status and loading behavior so blank states were diagnosable

### 2. Separating Product Reliability From Model Reliability

A major lesson was that a research app needs a reliable "product mode" even when the real model path is unstable.

That is why mock mode matters. It lets the full system be tested and demonstrated even when:

- model dependencies are incomplete
- GPU support is insufficient
- real multimodal inference is too expensive locally

### 3. Real-Mode Text Inference on Limited Hardware

Getting real-mode text inference to work surfaced several issues:

- missing upstream utilities
- language detection edge cases
- WhisperX runtime and device-selection failures
- hardware limitations on CPU/GPU paths

To make progress, I introduced targeted fixes around adapter behavior, event extraction, and local fallback logic. This made text-mode local experimentation far more practical, even if heavier audio/video workflows still need a stronger environment.

This was a useful lesson in research engineering: the hardest part was not "loading a model." The hardest part was making the entire inference pipeline reliable enough that a user could actually trust the surrounding workflow.

## Demo Example

For testing, I used Dylan Thomas's *Do not go gentle into that good night*.

Why this was a good input:

- short enough to run locally
- emotionally intense
- linguistically rich
- repetitive enough to inspect temporal behavior

The demo showed:

- predicted cortical activity in a 3D viewer
- frame-by-frame aligned text
- ROI evidence on the right panel
- fullscreen exploration with live activation overlays
- threshold-controlled ROI labeling and temporal scrubbing

One concrete thing I learned from the demo is that real-mode output amplitudes are often much smaller than mock-mode output amplitudes. That means UX choices like activation thresholds have to be calibrated differently, or the viewer will look active while the textual summaries appear empty.

That is a good example of the difference between:

- a technically correct system
- a system that is understandable to a human user

## What I Learned

The most important insight is this:

The real value is not that the app gives a final answer about the brain. The real value is that it makes a difficult research model inspectable.

Once the model output became explorable, it became easier to think about potential directions in:

- marketing and advertising
  to study how language choices may correlate with stronger predicted engagement patterns
- education
  to compare how wording may affect attention, comprehension, or memory-related signals
- research tooling
  to inspect emotionally loaded or cognitively dense content through a structured interface
- AI interpretability
  to build brain-inspired inspection layers around multimodal systems

I do not treat those as product claims yet. They are directions suggested by the interface and model behavior, not validated market outcomes.

## What I Would Improve Next

- move real audio/video inference to a stronger GPU environment such as Runpod
- calibrate thresholds automatically for real-mode outputs
- add batch experiments and dataset-scale analysis
- improve observability for long-running worker jobs
- add better summaries of frame-to-frame changes
- create a cleaner split between research tooling and showcase/demo UX

I would also improve the docs and experiment framing so it is easier for someone new to the project to understand:

- what the model is actually predicting
- what the UI is visualizing
- where the line is between research exploration and real-world applicability

## Outcome

In one week, I turned a research paper and upstream model into a usable local research application.

What makes this project valuable to me is not just that it runs, but that it sits at the intersection of:

- research engineering
- applied AI
- systems debugging
- product thinking
- technical storytelling

It is a good example of the kind of work I enjoy most: taking something technically interesting but inaccessible, and turning it into something people can actually interact with and learn from.
