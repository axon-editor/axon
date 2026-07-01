package configstore

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	SelectedModel string `json:"selectedModel"`
}

func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".axon", "agent-config.json"), nil
}

func Load() Config {
	path, err := Path()
	if err != nil {
		return Config{}
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}
	}

	var config Config
	if err := json.Unmarshal(raw, &config); err != nil {
		return Config{}
	}
	return config
}

func Save(config Config) error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}
