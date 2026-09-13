// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package agentcli

import "errors"

// errCoreUnavailable is shared by discovery and startup so every command fails
// with the same message when the local backend cannot be reached. The CLI does
// not expose runtime internals here; the user only needs to know that the Axon
// backend is unavailable.
var errCoreUnavailable = errors.New("axon-core is not running and axon could not start it")
