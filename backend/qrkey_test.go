package coolmaze

import "testing"

func TestValidQrKey(t *testing.T) {
	for s, expected := range map[string]bool{
		// Too short
		"":    false,
		"a":   false,
		"abc": false,
		// OK
		"12345678901": true,
		"abcdefghijk": true,
		"ABCDEfgh123": true,
		// Too long
		"123456789012":  false,
		"abcdefghijklm": false,
		// Unexpected chars
		"12345_78901": false,
		"123456-8901": false,
		"1234567é901": false,
		"12345678.01": false,
		"123456789,1": false,
	} {
		if valid := isValidQrKey(s); valid != expected {
			t.Errorf("isValidQrKey(%q)==%t, expected %t", s, valid, expected)
		}
	}
}
