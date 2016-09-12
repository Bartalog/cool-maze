package coolmaze

import (
	"fmt"
	"net/http"
	"regexp"

	"github.com/pusher/pusher-http-go"

	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/memcache"
	"google.golang.org/appengine/urlfetch"
)

// This broker forwards notifications and payload from source mobile
// app to the target browser.
// However it doesn't give to the target any specific information about
// the source (IP, OS, username, etc.).

func init() {
	http.HandleFunc("/scanned", scanNotification)
	http.HandleFunc("/dispatch", dispatch)
}

const (
	pusherAppID = "197093"
	pusherKey   = "e36002cfca53e4619c15"
)

// Create file secret.go to provide value
var pusherSecret string

// Optional request after the mobile app has succesfully scanned
// the QR-code, but before it has finished uploading the resource payload.
func scanNotification(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	c := appengine.NewContext(r)

	if r.Method != "POST" {
		log.Warningf(c, "Only POST method is accepted")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}

	if countryMismatch(r) {
		// Abort. Silently.
		return
	}

	qrKey := r.FormValue("qrKey")
	event := "maze-scan"
	thumbnailDataURI := r.FormValue("thumb")

	if qrKey == "" {
		log.Warningf(c, "Missing mandatory parameter: qrKey")
		paramChanID := r.FormValue("chanID")
		if paramChanID != "" {
			// Legacy app from 2016-08-20 would read a qrKey,
			// and think it is a chanID.
			// No big deal, just the name changed.
			qrKey = paramChanID
			log.Warningf(c, "Used legacy param chanID :(")
		} else {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintln(w, "Mandatory parameter: qrKey")
			return
		}
	}

	if !isValidQrKey(qrKey) {
		log.Warningf(c, "[%s] is not a valid qrKey", qrKey)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "qrKey must be valid")
		return
	}

	// Since #108 qrKey==chanID
	channelID := qrKey

	urlfetchClient := urlfetch.Client(c)
	log.Infof(c, "Sending scan notification to chan [%v]", channelID)

	pusherClient := pusher.Client{
		AppId:      pusherAppID,
		Key:        pusherKey,
		Secret:     pusherSecret,
		HttpClient: urlfetchClient,
	}

	data := map[string]string{}
	if thumbnailDataURI != "" {
		log.Infof(c, "A thumbnail is provided, size %d", len(thumbnailDataURI))
		if len(thumbnailDataURI) < 7000 {
			data["message"] = thumbnailDataURI
		} else {
			log.Errorf(c, "Not sending thumbnail (too big, would risk hitting the 10KB Pusher limit)")
		}
	}
	_, err := pusherClient.Trigger(channelID, event, data)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Encountered error:", err)
		return
	}
	fmt.Fprintln(w, "Done :)")
}

// Note that AppEngine doesn't support response streaming.
// The "dispatch" http response will be 1-shot.
func dispatch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	c := appengine.NewContext(r)

	if r.Method != "POST" {
		log.Warningf(c, "Only POST method is accepted")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}

	if countryMismatch(r) {
		// Abort. Silently.
		return
	}

	qrKey := r.FormValue("qrKey")
	event := "maze-cast"
	message := r.FormValue("message")
	gcsObjectName := r.FormValue("gcsObjectName")
	hash := r.FormValue("hash")

	if qrKey == "" {
		log.Warningf(c, "Missing mandatory parameter: qrKey")
		paramChanID := r.FormValue("chanID")
		if paramChanID != "" {
			// Legacy app from 2016-08-20 would read a qrKey,
			// and think it is a chanID.
			// No big deal, just the name changed.
			qrKey = paramChanID
			log.Warningf(c, "Used legacy param chanID :(")
		} else {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintln(w, "Mandatory parameter: qrKey")
			return
		}
	}

	if !isValidQrKey(qrKey) {
		log.Warningf(c, "[%s] is not a valid qrKey", qrKey)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "qrKey must be valid")
		return
	}

	if message == "" {
		log.Warningf(c, "Missing mandatory parameter: message")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: message")
		return
	}

	// Since #108 qrKey==chanID
	channelID := qrKey

	urlfetchClient := urlfetch.Client(c)
	log.Infof(c, "Sending from qrKey [%v] to chan [%v] message [%v]", qrKey, channelID, message)

	pusherClient := pusher.Client{
		AppId:      pusherAppID,
		Key:        pusherKey,
		Secret:     pusherSecret,
		HttpClient: urlfetchClient,
	}

	data := map[string]string{"message": message}
	be, err := pusherClient.Trigger(channelID, event, data)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Encountered error:", err)
		return
	}
	log.Infof(c, "Pusher events = %v", be)

	if hash != "" && gcsObjectName != "" {
		// #32 memorize Hash->ObjectName in Memcache, in case the same file is sent again.
		cacheKey := "objectName_for_" + hash
		cacheItem := &memcache.Item{
			Key:        cacheKey,
			Value:      []byte(gcsObjectName),
			Expiration: fileMemcacheTTL,
		}
		err := memcache.Set(c, cacheItem)
		if err != nil {
			log.Warningf(c, "Failed setting cache[%v] : %v", cacheKey, err)
		}
		log.Infof(c, "Set cache[%q] = %q", cacheKey, gcsObjectName)
	}

	fmt.Fprintln(w, "Done :)")
}

// isValidQrKey validates a string encoded in a QR-code on page coolmaze.net .
// Since #108 a valid qrKey is string of exactly 11 characters
// from 62-char-set [0-9a-zA-Z].
func isValidQrKey(s string) bool {
	// return len(s) == 11 &&
	return validQrKeyPattern.MatchString(s)
}

var validQrKeyPattern = regexp.MustCompile("^[0-9a-zA-Z]{11}$")

// Since #108 qrKey==chanID
func isValidChanID(s string) bool {
	return isValidQrKey(s)
}

func countryMismatch(r *http.Request) bool {
	const dontKnow = false
	c := appengine.NewContext(r)
	qrKey := r.FormValue("qrKey")
	country := r.Header.Get("X-AppEngine-Country")
	latlong := r.Header.Get("X-AppEngine-CityLatLong")

	cacheKey := "country_from_qrKey_" + qrKey
	var cacheItem *memcache.Item
	var errMC error
	cacheItem, errMC = memcache.Get(c, cacheKey)
	if errMC == memcache.ErrCacheMiss {
		// Not in Memcache. Can't establish fraud.
		// Memcache entries vanish anytime so it's normal we sometimes forget.
		log.Warningf(c, "country for qrKey [%s] wasn't in memcache", qrKey)
		return dontKnow
	}
	if errMC != nil {
		// Memcache broken. Can't establish fraud.
		log.Warningf(c, "Problem with memcache: %v", errMC)
		return dontKnow
	}
	cacheCountry := string(cacheItem.Value)

	if country == cacheCountry {
		// This is what should always happen.
		// All other code paths are exceptional.
		log.Infof(c, "Country [%s] correctly matches cache :)", country)
		return false
	}

	// Different countries!
	// But maybe 2 neighbour countries, around a border?
	cacheKey = "latlong_from_qrKey_" + qrKey
	cacheItem, errMC = memcache.Get(c, cacheKey)
	if errMC == memcache.ErrCacheMiss {
		// Not in Memcache. Can't establish fraud.
		log.Warningf(c, "latlong for qrKey [%s] wasn't in memcache", qrKey)
		return dontKnow
	}
	if errMC != nil {
		// Memcache broken. Can't establish fraud.
		log.Warningf(c, "Problem with memcache: %v", errMC)
		return dontKnow
	}
	cacheLatlong := string(cacheItem.Value)
	ok, dist := strDistKm(latlong, cacheLatlong)
	if !ok {
		// Latlongs could not be parsed. Can't establish fraud.
		log.Warningf(c, "Couldn't compute distance between [%s] and [%s].", latlong, cacheLatlong)
		return dontKnow
	}
	if dist < 500.0 {
		// Okay, let's be tolerant
		log.Warningf(c, "Country mismatch [%s] [%s], but locations are close: [%s] [%s] (%.0fkm)", country, cacheCountry, latlong, cacheLatlong, dist)
		return false
	}

	log.Errorf(c, "New request for qrKey [%s] from source location [%s][%s] (%.0fkm away) doesn't match cached target location [%s][%s]", qrKey, country, latlong, dist, cacheCountry, cacheLatlong)
	return true
}
