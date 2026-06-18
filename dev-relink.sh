# Dev-only: keep the JupyterLab labextension symlinked into every pixi env.
#
# Why: a pip *editable* reinstall (triggered when pyproject/source changes)
# copies a fresh — often stale — real labextension dir over develop.py's
# symlink. JupyterLab then serves an outdated bundle (404 chunk errors,
# missing launcher tile). This runs on every pixi-env activation and re-links
# best-effort, so the symlink is restored right before your command runs.
#
# Sourced by pixi (not executed) — must NOT call `exit`, and must not leave
# the caller in a changed directory (hence the subshell).
if [ -d "${PIXI_PROJECT_ROOT:-.}/jupyter_bioacoustic/labextension" ]; then
  ( cd "${PIXI_PROJECT_ROOT:-.}" && python develop.py >/dev/null 2>&1 ) || true
fi
