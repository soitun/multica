package daemon

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/multica-ai/multica/server/internal/cli"
)

// daemonIDFileName is the per-machine file that stores this host's stable
// daemon identifier. Once created, the UUID inside is the daemon's identity
// forever — hostname changes, .local suffix drift, profile switches, and
// system renames no longer mint a new identity.
const daemonIDFileName = "daemon.id"

// EnsureDaemonID returns a stable UUID for this machine, persisting it to
// disk at `~/.multica/daemon.id` on first call.
//
// The file is intentionally NOT per-profile. A single machine has one daemon
// identity regardless of which profile the user is running under — the CLI
// daemon (default profile) and the Desktop daemon (its own `desktop-<host>`
// profile) must both register against the same runtime row, or the user ends
// up with two rows per provider per workspace every time they open the
// Desktop app after using the CLI (or vice versa). The unique constraint
// `(workspace_id, daemon_id, provider)` then naturally collapses them.
//
// Profiles still own their own config.json / log / token — only *identity*
// is machine-wide.
//
// If the file exists but is corrupt (unparseable), it is regenerated so the
// daemon can continue starting up instead of hard-failing.
func EnsureDaemonID() (string, error) {
	dir, err := cli.ProfileDir("")
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, daemonIDFileName)

	if data, err := os.ReadFile(path); err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			if _, perr := uuid.Parse(id); perr == nil {
				return id, nil
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("read daemon id file: %w", err)
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create multica directory: %w", err)
	}

	id, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("generate daemon id: %w", err)
	}

	tmp, err := os.CreateTemp(dir, ".daemon-*.id.tmp")
	if err != nil {
		return "", fmt.Errorf("create temp daemon id file: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(id.String() + "\n"); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("write temp daemon id file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("close temp daemon id file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("chmod temp daemon id file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("rename daemon id file: %w", err)
	}

	return id.String(), nil
}

// LegacyDaemonIDs returns the set of daemon_id values this machine may have
// previously registered under, before the switch to a persistent UUID. The
// server uses this list at registration time to merge old runtime rows into
// the new UUID-keyed row (moving agents/tasks then deleting the stale row).
//
// Three historical formats are covered:
//
//   - pre-#906:  "<hostname>-<profile>"        (profile suffix, no .local strip)
//   - pre-#1070: "<hostname>"                  (raw hostname, often ends in .local)
//   - current:   "<hostname>" with .local drift depending on system state
//
// .local drift is bidirectional — at different times os.Hostname() has
// returned both "foo" and "foo.local" on the same machine (mDNS state,
// system restart, login item order). So regardless of which form is current
// now, we always emit BOTH the bare and .local-suffixed variants so migration
// covers whichever form was persisted previously. Case drift is handled on
// the server side via case-insensitive lookup, so we don't also emit cased
// permutations here.
func LegacyDaemonIDs(hostname, profile string) []string {
	host := strings.TrimSpace(hostname)
	if host == "" {
		return nil
	}
	stripped := strings.TrimSuffix(host, ".local")
	dotLocal := stripped + ".local"

	hostForms := []string{stripped, dotLocal}

	candidates := make([]string, 0, len(hostForms)*2)
	candidates = append(candidates, hostForms...)
	if profile != "" {
		for _, h := range hostForms {
			candidates = append(candidates, h+"-"+profile)
		}
	}

	seen := make(map[string]struct{}, len(candidates))
	out := make([]string, 0, len(candidates))
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
	}
	return out
}

// filterLegacyIDs removes any entry equal to current (e.g. when the user
// explicitly pins MULTICA_DAEMON_ID to the hostname itself, there's nothing
// to migrate — the row is already keyed on the current id).
func filterLegacyIDs(ids []string, current string) []string {
	if current == "" {
		return ids
	}
	out := ids[:0]
	for _, id := range ids {
		if id == current {
			continue
		}
		out = append(out, id)
	}
	return out
}
