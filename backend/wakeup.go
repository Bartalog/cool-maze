package coolmaze

import (
	"fmt"
	"net/http"

	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/memcache"
)

func init() {
	//
	// Wake Up is a sort of manual (explicit) warmup request.
	// It should be triggered by all clients at startup (browser, mobile device) to
	// make sure the subsequent request won't face a cold start (Loading request).
	// See also https://cloud.google.com/appengine/docs/go/warmup-requests/
	//
	http.HandleFunc("/wakeup",
		func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			fmt.Fprintln(w, "ok")
			// Instance should be warm by now

			c := appengine.NewContext(r)
			qrKey := r.FormValue("qrKey")
			if qrKey != "" {
				// Comes from target desktop computer browser
				log.Infof(c, "Wakeup from qrKey [%s]", qrKey)
				// Remember the country, so we can compare with
				// subsequent /scanned or /dispatch
				country := r.Header.Get("X-AppEngine-Country")
				latlong := r.Header.Get("X-AppEngine-CityLatLong")

				cacheKey := "country_from_qrKey_" + qrKey
				cacheItem := &memcache.Item{
					Key:   cacheKey,
					Value: []byte(country),
				}
				err := memcache.Set(c, cacheItem)
				if err != nil {
					log.Warningf(c, "Failed setting cache[%v] : %v", cacheKey, err)
				}

				cacheKey = "latlong_from_qrKey_" + qrKey
				cacheItem = &memcache.Item{
					Key:   cacheKey,
					Value: []byte(latlong),
				}
				err = memcache.Set(c, cacheItem)
				if err != nil {
					log.Warningf(c, "Failed setting cache[%v] : %v", cacheKey, err)
				}
			} else {
				log.Infof(c, "Wakeup from mobile")
			}

		})
}
