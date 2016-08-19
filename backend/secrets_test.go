package coolmaze

import (
	"os"
	"testing"
)

func TestPusherSecret(t *testing.T) {
	// secret.go is .gitignored
	// You have to give a valid value to pusherSecret before deploying.
	if pusherSecret == "" {
		t.Errorf("pusherSecret must be set. Consider creating source file secret.go.")
	}
}

func TestPemFile(t *testing.T) {
	// *.pem are .gitignored
	// You have to put fetch or generate PEM file before deploying.
	_, err := os.Stat(pemFile)
	if os.IsNotExist(err) {
		t.Errorf("Secret file %s must exist", pemFile)
	}
}
