# Third-Party Notices

This repository is published for personal, research, and other non-commercial use only.

## Upstream TRIBE v2

This project integrates with the upstream TRIBE v2 project and model from Meta / facebookresearch.

Relevant upstream sources referenced by this repository:

- GitHub: `https://github.com/facebookresearch/tribev2`
- Hugging Face model: `https://huggingface.co/facebook/tribev2`

According to the upstream project documentation and model listing used by this repository, TRIBE v2 is licensed under:

- `CC-BY-NC-4.0`
- Creative Commons Attribution-NonCommercial 4.0 International
- License URL: `https://creativecommons.org/licenses/by-nc/4.0/`

## How This Repository Uses TRIBE v2

This repository does not vendor the full upstream TRIBE v2 source tree into the application codebase. Instead, it:

- references the upstream TRIBE v2 model identifier
- installs the upstream `tribev2` package during the real-mode worker image build
- integrates with TRIBE v2 through adapter code in `src/virtual_subject/adapters/tribe.py`
- includes local integration changes and workflow code around stimulus handling, job processing, viewing, analysis, and export

## Attribution

Upstream work should be attributed to its original authors and source locations above.

If you share this repository or derivative non-commercial work based on it, you should retain:

- attribution to the upstream TRIBE v2 project
- a reference to the CC-BY-NC-4.0 license
- a clear indication that this repository contains additional integration and application-layer modifications

## Important Restriction

Do not use this repository, or any build or distribution that depends on upstream TRIBE v2 materials, for commercial purposes unless you have obtained the necessary rights from the upstream licensors.

## No Endorsement

Nothing in this repository implies endorsement by Meta, facebookresearch, or the upstream TRIBE v2 authors.
