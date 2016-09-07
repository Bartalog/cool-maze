package coolmaze

import (
	"math"
	"strconv"
	"strings"
)

func strDistKm(latlong1, latlong2 string) (bool, float64) {
	const dontKnow = false
	if latlong1 == "" || latlong2 == "" {
		// Can't say. Must be tolerant.
		return dontKnow, 0
	}

	coords1 := strings.Split(latlong1, ",")
	if len(coords1) != 2 {
		return dontKnow, 0
	}
	lat1, err := strconv.ParseFloat(coords1[0], 64)
	if err != nil {
		return dontKnow, 0
	}
	long1, err := strconv.ParseFloat(coords1[1], 64)
	if err != nil {
		return dontKnow, 0
	}

	coords2 := strings.Split(latlong2, ",")
	if len(coords2) != 2 {
		return dontKnow, 0
	}
	lat2, err := strconv.ParseFloat(coords2[0], 64)
	if err != nil {
		return dontKnow, 0
	}
	long2, err := strconv.ParseFloat(coords2[1], 64)
	if err != nil {
		return dontKnow, 0
	}

	return true, distKm(lat1, long1, lat2, long2)
}

// distKm code taken from https://gist.github.com/cdipaolo/d3f8db3848278b49db68
func distKm(lat1, lon1, lat2, lon2 float64) float64 {
	hsin := func(theta float64) float64 {
		return math.Pow(math.Sin(theta/2), 2)
	}

	// convert to radians
	// must cast radius as float
	var la1, lo1, la2, lo2, r float64
	la1 = lat1 * math.Pi / 180
	lo1 = lon1 * math.Pi / 180
	la2 = lat2 * math.Pi / 180
	lo2 = lon2 * math.Pi / 180

	r = 6378.1 // Earth radius in KILOMETERS
	h := hsin(la2-la1) + math.Cos(la1)*math.Cos(la2)*hsin(lo2-lo1)
	return 2 * r * math.Asin(math.Sqrt(h))
}
