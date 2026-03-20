# zs-runner interactive shell defaults

case "$-" in
    *i*) ;;
    *) return 0 ;;
esac

alias ll='ls -alF --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias ls='ls --color=auto'

export LESS='-FRX'

if [ -f /usr/share/bash-completion/bash_completion ]; then
    # shellcheck disable=SC1091
    . /usr/share/bash-completion/bash_completion
fi
