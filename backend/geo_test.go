package coolmaze

import "testing"

func TestFarAway(t *testing.T) {
	for _, z := range []struct {
		latlong1, latlong2 string
		expected           bool
	}{
		// Too far!
		{"37.386051,-122.083851", "0.0,0.0", true},
		{"37.386051,-122.083851", "48.8567,2.3508", true},
		// Close enough.
		{"37.386051,-122.083851", "37.386999,-122.083999", false},
		// Same "location".
		{"37.386051,-122.083851", "37.386051,-122.083851", false},
		{"48.8567,2.3508", "48.8567,2.3508", false},
		// Wrong format. Must be tolerant.
		{"", "", false},
		{"", "37.386051,-122.083851", false},
		{"37.386051,-122.083851", "", false},
		{"37.386051,-122.083851", "48.8567 2.3508", false},
		{"37.386051,-122.083851", "48.8567,,2.3508", false},
	} {
		result := farAway(z.latlong1, z.latlong2)
		if result != z.expected {
			t.Errorf("farAway(%q, %q) is %t, expected %t", z.latlong1, z.latlong2, result, z.expected)
		}
	}
}
