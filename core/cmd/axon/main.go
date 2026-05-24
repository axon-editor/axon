package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/GordenArcher/axon-core/internal/server"
)

func main() {
	fmt.Println("Axon core starting...")

	s := server.New()

	log.Fatal(http.ListenAndServe(":7777", s.Router()))
}
