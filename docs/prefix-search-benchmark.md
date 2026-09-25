# Prefix-search benchmark (KYR-33)

Run `npm run benchmark:prefix`. It uses only an in-memory, deterministic synthetic fixture: 10,000 generated ASCII
Terms plus duplicate and NFC/NFD accent controls. It verifies indexed-search parity against the current `searchTerms`
implementation before measuring blank, broad, selective, Unicode, duplicate, and no-match queries. No Glossary File,
history, cache, Raycast storage, or network is read or written.

The indexed candidate approach is deliberately benchmark-only. It binary-searches printable-ASCII names for an ASCII
query, while retaining the current ICU matcher for names outside that subset; a non-ASCII query falls back to checking
every name. It restores source order before applying the current locale sort and uses the same blank-query history
collection. This keeps the benchmark's result identity, matching, and ordering equivalent to the existing linear
implementation without changing production switching behavior.

## Calibration result

On 2026-09-19, the report command ran under Node `v26.0.0` with ICU `78.3`. Those are the benchmark-runner values,
not fresh Raycast application evidence: this worktree had no active Raycast development runtime and `ray` was not on
the shell path. The extension's supported/CI Node version remains `22.22.2`; rerun the command in the target runtime
before treating these timings as device-specific release evidence.

Each reported sample is a full seven-query batch; tail columns are batch milliseconds. The command uses 50 repetitions
after an unmeasured warm-up. Cold indexed samples rebuild the index for each query. Rendering is intentionally not
measured because Raycast list rendering requires its application runtime; match collection does materialize and sort
the same result rows the command supplies to Raycast.

| Phase                         | p50 ms | p95 ms | p99 ms | max ms |
| ----------------------------- | -----: | -----: | -----: | -----: |
| Current linear end-to-end     | 56.650 | 57.462 | 57.696 | 57.696 |
| Indexed preparation           |  0.879 |  0.908 |  1.925 |  1.925 |
| Indexed warm lookup           | 22.907 | 24.058 | 24.200 | 24.200 |
| Indexed warm match collection |  3.549 |  3.697 |  3.791 |  3.791 |
| Indexed warm end-to-end       | 26.534 | 27.711 | 27.759 | 27.759 |
| Indexed cold end-to-end       | 33.757 | 36.106 | 37.015 | 37.015 |

At 20 typed lookups per prepared index, the measured p50 amortized indexed cost was 26.578 ms per query. Supplemental
synthetic calibration in the same Node/ICU runner at 500, 1,000, and 5,000 entries showed p50
linear/warm-indexed/amortized costs of 2.757/1.714/1.716 ms, 5.370/3.280/3.285 ms, and
28.091/13.596/13.618 ms respectively.

**Finding for KYR-34:** use **X = 500 Terms** as the initial eligibility cutoff for a future production experiment,
with a prepared index reused for at least 20 typed lookups. Keep the current linear path below X; preserve linear ICU
fallback for non-ASCII names and re-run this benchmark in the actual Raycast runtime before shipping a switch. This
ticket does not implement that switch.
