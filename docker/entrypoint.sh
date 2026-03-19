#!/usr/bin/env bash
set -euo pipefail

seed_dir_if_needed() {
    src_dir="$1"
    dst_dir="$2"

    mkdir -p "${dst_dir}"
    echo "[entrypoint] Syncing missing Claude template defaults into ${dst_dir}" >&2
    rsync -a --ignore-existing "${src_dir}/" "${dst_dir}/"
}

resolve_user_home() {
    if [ -n "${HOME:-}" ]; then
        printf '%s\n' "${HOME}"
        return
    fi

    current_uid="$(id -u)"
    passwd_home="$(getent passwd "${current_uid}" | cut -d: -f6)"
    if [ -n "${passwd_home}" ]; then
        printf '%s\n' "${passwd_home}"
        return
    fi

    echo "[entrypoint] ERROR: unable to resolve user home; set HOME or use a user with a valid passwd entry" >&2
    exit 1
}

ensure_nvm_runtime() {
    export NVM_DIR="${NVM_DIR:-/data/nvm}"
    nvm_source_dir="${NVM_SOURCE_DIR:-/opt/nvm}"

    mkdir -p "${NVM_DIR}"
    if [ ! -f "${NVM_DIR}/nvm.sh" ]; then
        cp -a "${nvm_source_dir}/." "${NVM_DIR}/"
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

    mkdir -p "${GOENV_ROOT}"
    if [ ! -x "${GOENV_ROOT}/bin/goenv" ]; then
        cp -a "${goenv_source_dir}/." "${GOENV_ROOT}/"
    fi

    export PATH="${GOENV_ROOT}/bin:${GOENV_ROOT}/shims:${PNPM_HOME}:${PATH}"

    if ! command -v goenv >/dev/null 2>&1; then
        echo "[entrypoint] ERROR: goenv command not found" >&2
        exit 1
    fi
}

backup_existing_path_if_needed() {
    path_to_check="$1"
    expected_target="$2"

    if [ -L "${path_to_check}" ]; then
        current_target="$(readlink "${path_to_check}")"
        if [ "${current_target}" = "${expected_target}" ]; then
            return
        fi

        echo "[entrypoint] WARN: replacing unexpected symlink ${path_to_check} -> ${current_target}" >&2
        rm -f "${path_to_check}"
        return
    fi

    if [ -e "${path_to_check}" ]; then
        backup_path="${path_to_check}.bak"
        timestamp="$(date +%Y%m%d%H%M%S)"
        if [ -e "${backup_path}" ] || [ -L "${backup_path}" ]; then
            backup_path="${backup_path}.${timestamp}"
        fi
        echo "[entrypoint] WARN: moving existing path ${path_to_check} to ${backup_path} before creating symlink" >&2
        mv "${path_to_check}" "${backup_path}"
    fi
}

ensure_symlink() {
    link_path="$1"
    target_path="$2"

    backup_existing_path_if_needed "${link_path}" "${target_path}"
    ln -sfn "${target_path}" "${link_path}"
}

ensure_claude_config() {
    claude_template_dir="${CLAUDE_TEMPLATE_DIR:-/opt/zhushen/claude-default}"
    claude_data_root="${CLAUDE_DATA_ROOT:-/data/claude}"
    resolved_home="$(resolve_user_home)"
    claude_config_dir="${resolved_home}/.claude"
    claude_legacy_config_path="${resolved_home}/.claude.json"
    claude_data_config_dir="${claude_data_root}/.claude"
    claude_data_legacy_config_path="${claude_data_root}/.claude.json"

    export HOME="${resolved_home}"
    export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${resolved_home}/.config}"
    export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-${claude_config_dir}}"

    mkdir -p "${resolved_home}" "${XDG_CONFIG_HOME}" "${claude_data_root}"

    if [ ! -d "${claude_template_dir}/.claude" ]; then
        echo "[entrypoint] ERROR: Claude template directory missing: ${claude_template_dir}/.claude" >&2
        exit 1
    fi

    if [ ! -f "${claude_template_dir}/.claude.json" ]; then
        echo "[entrypoint] ERROR: Claude legacy template missing: ${claude_template_dir}/.claude.json" >&2
        exit 1
    fi

    mkdir -p "${claude_data_config_dir}"
    seed_dir_if_needed "${claude_template_dir}/.claude" "${claude_data_config_dir}"

    if [ ! -f "${claude_data_legacy_config_path}" ]; then
        cp -a "${claude_template_dir}/.claude.json" "${claude_data_legacy_config_path}"
    fi

    ensure_symlink "${claude_config_dir}" "${claude_data_config_dir}"
    ensure_symlink "${claude_legacy_config_path}" "${claude_data_legacy_config_path}"
    export CLAUDE_CONFIG_DIR="${claude_config_dir}"
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
        if ! goenv versions --bare 2>/dev/null | grep -qx "${ZS_GO_VERSION}"; then
            echo "[entrypoint] Go ${ZS_GO_VERSION} not installed, installing with goenv..." >&2
            if ! goenv install -s "${ZS_GO_VERSION}" </dev/null; then
                echo "[entrypoint] ERROR: goenv install ${ZS_GO_VERSION} failed" >&2
                exit 1
            fi
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

    mkdir -p "${XDG_CONFIG_HOME}"
    echo "[entrypoint] Running RTK global init..." >&2

    if RTK_NON_INTERACTIVE=true rtk init --global --auto-patch </dev/null; then
        return
    fi

    echo "[entrypoint] WARN: rtk init --auto-patch failed, falling back to plain init" >&2
    if ! RTK_NON_INTERACTIVE=true rtk init --global </dev/null; then
        echo "[entrypoint] WARN: rtk init failed, but continuing startup" >&2
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
