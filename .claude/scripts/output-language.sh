#!/bin/bash
# output-language.sh - Language configuration helper for PM Orchestrator v2.2.0
# Usage: source .claude/scripts/output-language.sh

set -euo pipefail

# Default configuration file path
CONFIG_FILE="${PROJECT_CONFIG_FILE:-.claude/project-config.json}"

# Get the resolved output language
get_output_language() {
    local config_file="${1:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        echo "ja"  # Default fallback
        return 0
    fi

    local default_lang
    default_lang=$(jq -r '.language.defaultLanguage // "ja"' "$config_file" 2>/dev/null || echo "ja")

    echo "$default_lang"
}

# Check if auto-detect is enabled
is_autodetect_enabled() {
    local config_file="${1:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        echo "false"
        return 0
    fi

    local autodetect
    autodetect=$(jq -r '.language.autoDetect // false' "$config_file" 2>/dev/null || echo "false")

    echo "$autodetect"
}

# Get language mode (explicit or auto-detect)
get_language_mode() {
    local config_file="${1:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        echo "explicit"
        return 0
    fi

    local mode
    mode=$(jq -r '.language.mode // "explicit"' "$config_file" 2>/dev/null || echo "explicit")

    echo "$mode"
}

# Detect language from input text (basic detection)
detect_language() {
    local input_text="$1"

    # Check for Japanese characters (Hiragana, Katakana, Kanji)
    if echo "$input_text" | grep -qE '[\x{3040}-\x{309F}\x{30A0}-\x{30FF}\x{4E00}-\x{9FFF}]' 2>/dev/null; then
        echo "ja"
        return 0
    fi

    # Default to English
    echo "en"
}

# Resolve output language based on config and optional input
resolve_output_language() {
    local config_file="${1:-$CONFIG_FILE}"
    local user_input="${2:-}"

    local default_lang
    default_lang=$(get_output_language "$config_file")

    local autodetect
    autodetect=$(is_autodetect_enabled "$config_file")

    if [[ "$autodetect" == "true" ]] && [[ -n "$user_input" ]]; then
        detect_language "$user_input"
    else
        echo "$default_lang"
    fi
}

# Generate language context for subagent prompts
generate_language_context() {
    local config_file="${1:-$CONFIG_FILE}"
    local user_input="${2:-}"

    local output_lang
    output_lang=$(resolve_output_language "$config_file" "$user_input")

    local lang_mode
    lang_mode=$(get_language_mode "$config_file")

    cat <<EOF
outputLanguage: "$output_lang"
languageMode: "$lang_mode"
EOF
}

# Print full language configuration
print_language_config() {
    local config_file="${1:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        echo "Configuration file not found: $config_file"
        return 1
    fi

    echo "=== Language Configuration ==="
    jq '.language' "$config_file" 2>/dev/null || echo "No language configuration found"
    echo ""
    echo "Resolved output language: $(get_output_language "$config_file")"
    echo "Language mode: $(get_language_mode "$config_file")"
    echo "Auto-detect enabled: $(is_autodetect_enabled "$config_file")"
}

# Main execution when run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-help}" in
        get)
            get_output_language "${2:-}"
            ;;
        mode)
            get_language_mode "${2:-}"
            ;;
        autodetect)
            is_autodetect_enabled "${2:-}"
            ;;
        detect)
            detect_language "${2:-}"
            ;;
        resolve)
            resolve_output_language "${2:-}" "${3:-}"
            ;;
        context)
            generate_language_context "${2:-}" "${3:-}"
            ;;
        config)
            print_language_config "${2:-}"
            ;;
        help|*)
            cat <<EOF
output-language.sh - Language configuration helper

Usage:
  ./output-language.sh get [config_file]        Get default output language
  ./output-language.sh mode [config_file]       Get language mode
  ./output-language.sh autodetect [config_file] Check if auto-detect is enabled
  ./output-language.sh detect "text"            Detect language from text
  ./output-language.sh resolve [config] [text]  Resolve output language
  ./output-language.sh context [config] [text]  Generate language context for subagents
  ./output-language.sh config [config_file]     Print full language configuration

Examples:
  ./output-language.sh get
  ./output-language.sh resolve .claude/project-config.json "Hello world"
  ./output-language.sh context .claude/project-config.json "こんにちは"
EOF
            ;;
    esac
fi
