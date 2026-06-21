package agentcli

import "errors"

// errCoreUnavailable is shared by discovery and startup so every command fails
// with the same message when the local backend cannot be reached. The CLI does
// not expose runtime internals here; the user only needs to know that the Axon
// backend is unavailable.
var errCoreUnavailable = errors.New("axon-core is not running and axon could not start it")
