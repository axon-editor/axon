package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/GordenArcher/godenv"
	"github.com/GordenArcher/axon-core/internal/server"
)

func main() {
	fmt.Println("Axon core starting...")

	s := server.New()

	// I only load .env when the file exists because packaged Axon builds will
	// usually start from the Electron resources directory, where a project
	// .env is not expected. Treating a missing .env as an error would make the
	// bundled desktop app fail before the editor can open, while still letting
	// local development override values through a normal environment file.
	if _, err := os.Stat(".env"); err == nil {
		if err := godenv.Load(".env"); err != nil {
			log.Fatalf("failed to load .env: %v", err)
		}
	}
	port := godenv.Get("AXON_CORE_PORT", "7777")

	// The packaged Electron app starts axon-core as a child process. Keeping
	// the port configurable lets the desktop shell choose the API port without
	// baking release-specific behavior into the core server, while preserving
	// :7777 as the stable development default used by the renderer.
	log.Fatal(http.ListenAndServe(":"+port, s.Router()))
}
