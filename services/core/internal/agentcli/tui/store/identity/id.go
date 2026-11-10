// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package identity

import "github.com/google/uuid"

// NewID returns the durable session/message identifier. UUIDs are used instead
// of timestamps because a resume can load rows created by another process, and
// timestamp collisions would overwrite one message with INSERT OR REPLACE.
func NewID() string {
	return uuid.NewString()
}
