package coolmaze

import (
	"os"
	"testing"
)

func TestPusherSecret(t *testing.T) {
	if pusherSecret == "" {
		t.Errorf("pusherSecret must be set. Consider creating source file secret.go.")
	}
}

func TestPemFile(t *testing.T) {
	_, err := os.Stat(pemFile)
	if os.IsNotExist(err) {
		t.Errorf("Secret file %s must exist", pemFile)
	}
}
