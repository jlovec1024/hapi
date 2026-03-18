#!/usr/bin/env bash
set -euo pipefail

copy_dir_if_empty() {
    src_dir="$1"
    dst_dir="$2"

    mkdir -p "${dst_dir}"
    if [ -z "$(ls -A "${dst_dir}" 2>/dev/null)" ]; then
        cp -a "${src_dir}/." "${dst_dir}/"
    fi
}

ensure_nvm_runtime() {
    export NVM_DIR="${NVM_DIR:-/data/nvm}"
    nvm_source_dir="${NVM_SOURCE_DIR:-/opt/nvm}"

    mkdir -p "$(dirname "${NVM_DIR}")"
    if [ ! -f "${NVM_DIR}/nvm.sh" ]; then
        rm -rf "${NVM_DIR}"
        cp -a "${nvm_source_dir}" "${NVM_DIR}"
    fi

    export PNPM_HOME="${PNPM_HOME:-/usr/local/pnpm}"
    export PATH="${PNPM_HOME}:${PATH}"

    # shellcheck disable=SC1090
    if [ -f "${NVM_DIR}/nvm.sh" ]; then
        . "${NVM_DIR}/nvm.sh"
    else
        echo "[entrypoint] ERROR: nvm not found at ${NVM_DIR}/nvm.sh" >&2
        exit 1
    fi
}

ensure_goenv_runtime() {
    export GOENV_ROOT="${GOENV_ROOT:-/data/goenv}"
    goenv_source_dir="${GOENV_SOURCE_DIR:-/opt/goenv}"

    mkdir -p "$(dirname "${GOENV_ROOT}")"
    if [ ! -x "${GOENV_ROOT}/bin/goenv" ]; then
        rm -rf "${GOENV_ROOT}"
        cp -a "${goenv_source_dir}" "${GOENV_ROOT}"
    fi

    export PATH="${GOENV_ROOT}/bin:${GOENV_ROOT}/shims:${PNPM_HOME}:${PATH}"

    if ! command -v goenv >/dev/null 2>&1; then
        echo "[entrypoint] ERROR: goenv command not found" >&2
        exit 1
    fi
}

ensure_claude_config() {
    claude_data_root="${CLAUDE_DATA_ROOT:-/data/claude}"
    claude_template_dir="${CLAUDE_TEMPLATE_DIR:-/opt/zhushen/claude-default}"

    export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-${claude_data_root}/.claude}"
    export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${CLAUDE_CONFIG_DIR}/.config}"

    mkdir -p "${claude_data_root}" "${CLAUDE_CONFIG_DIR}" "${XDG_CONFIG_HOME}"

    if [ ! -d "${claude_template_dir}/.claude" ]; then
        echo "[entrypoint] ERROR: Claude template directory missing: ${claude_template_dir}/.claude" >&2
        exit 1
    fi

    copy_dir_if_empty "${claude_template_dir}/.claude" "${CLAUDE_CONFIG_DIR}"

    if [ ! -f "${claude_data_root}/.claude.json" ]; then
        cp -a "${claude_template_dir}/.claude.json" "${claude_data_root}/.claude.json"
    fi

    rm -f /root/.claude.json
    ln -s "${claude_data_root}/.claude.json" /root/.claude.json
}

ensure_runtime_versions() {
    if [ -n "${ZS_NODE_VERSION:-}" ]; then
        if ! nvm ls "${ZS_NODE_VERSION}" >/dev/null 2>&1; then
            echo "[entrypoint] Node.js ${ZS_NODE_VERSION} not installed, installing with nvm..." >&2
            nvm install "${ZS_NODE_VERSION}"
        fi
        nvm use "${ZS_NODE_VERSION}" >/dev/null
        export PATH="${PNPM_HOME}:${PATH}"
    fi

    if [ -n "${ZS_GO_VERSION:-}" ]; then
        if ! goenv versions --bare | grep -qx "${ZS_GO_VERSION}"; then
            echo "[entrypoint] Go ${ZS_GO_VERSION} not installed, installing with goenv..." >&2
            goenv install -s "${ZS_GO_VERSION}"
        fi
        goenv global "${ZS_GO_VERSION}"
        eval "$(goenv init -)"
    fi
}

configure_git_identity() {
    if [ -n "${ZS_GIT_USER_NAME:-}" ]; then
        git config --global user.name "${ZS_GIT_USER_NAME}"
    fi

    if [ -n "${ZS_GIT_USER_EMAIL:-}" ]; then
        git config --global user.email "${ZS_GIT_USER_EMAIL}"
    fi
}

ensure_rtk() {
    if ! command -v rtk >/dev/null 2>&1; then
        echo "[entrypoint] ERROR: rtk command not found in PATH" >&2
        echo "[entrypoint] Please ensure RTK is installed in the container" >&2
        exit 1
    fi

    rtk_config_dir="${XDG_CONFIG_HOME}/rtk"
    mkdir -p "${XDG_CONFIG_HOME}"
    if [ ! -d "${rtk_config_dir}" ] || [ -z "$(ls -A "${rtk_config_dir}" 2>/dev/null)" ]; then
        echo "[entrypoint] RTK config is empty, running first-boot rtk init..." >&2
        HOME=/root rtk init --global || {
            echo "[entrypoint] WARN: rtk init failed, but continuing startup" >&2
        }
    fi
}

main() {
    ensure_nvm_runtime
    ensure_goenv_runtime
    ensure_claude_config

    if ! command -v claude >/dev/null 2>&1; then
        echo "[entrypoint] ERROR: claude command not found in PATH" >&2
        echo "[entrypoint] Please ensure Claude Code is installed in the container" >&2
        exit 1
    fi

    ensure_runtime_versions
    configure_git_identity
    ensure_rtk

    exec "$@"
}

main "$@"
