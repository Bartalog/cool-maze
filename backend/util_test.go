package coolmaze

import "testing"

func TestSanitizeFilename(t *testing.T) {
	for _, x := range []struct {
		filename string
		expected string
	}{
		{"", ""},
		{".", "."},
		{"a", "a"},
		{"abc", "abc"},
		{"a.jpg", "a.jpg"},
		{"tic-tac-toe.png", "tic-tac-toe.png"},
		{"é.jpg", "_.jpg"},
		{"fun stuff.jpg", "fun_stuff.jpg"},
		{"extra fun stuff.jpg", "extra_fun_stuff.jpg"},
		{"ネコ.avi", "__.avi"},
	} {
		sanitized := sanitizeFilename(x.filename)
		if sanitized != x.expected {
			t.Errorf("Expected %q, got %q", x.expected, sanitized)
		}
	}
}
