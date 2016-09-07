package coolmaze

import "testing"

func TestStrDistKm(t *testing.T) {
	for _, z := range []struct {
		latlong1, latlong2 string
		expectedParsed     bool
		expectedAbove500   bool
	}{
		// Too far!
		{"37.386051,-122.083851", "0.0,0.0", true, true},
		{"37.386051,-122.083851", "48.8567,2.3508", true, true},
		// Close enough.
		{"37.386051,-122.083851", "37.386999,-122.083999", true, false},
		// Same "location".
		{"37.386051,-122.083851", "37.386051,-122.083851", true, false},
		{"48.8567,2.3508", "48.8567,2.3508", true, false},
		// Wrong format. Must be tolerant.
		{"", "", false, false},
		{"", "37.386051,-122.083851", false, false},
		{"37.386051,-122.083851", "", false, false},
		{"37.386051,-122.083851", "48.8567 2.3508", false, false},
		{"37.386051,-122.083851", "48.8567,,2.3508", false, false},
	} {
		parsed, result := strDistKm(z.latlong1, z.latlong2)
		if parsed != z.expectedParsed {
			t.Errorf("strDistKm(%q, %q) parsed is %t, expected %t", z.latlong1, z.latlong2, parsed, z.expectedParsed)
		}
		farAway := result > 500.0
		if farAway != z.expectedAbove500 {
			t.Errorf("strDistKm(%q, %q) distance is %t, expected %t", z.latlong1, z.latlong2, farAway != z.expectedAbove500)
		}
	}
}
