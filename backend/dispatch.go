package coolmaze

import (
	"fmt"
	"net/http"
	"regexp"

	"github.com/pusher/pusher-http-go"

	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
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

	qrKey := r.FormValue("qrKey")
	event := "maze-scan"

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

	var data map[string]string = nil
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

	qrKey := r.FormValue("qrKey")
	event := "maze-cast"
	message := r.FormValue("message")

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

	fmt.Fprintln(w, "Done :)")
}

// isValidQrKey validates a string encoded in a QR-code on page coolmaze.net .
// Since #108 a valid chan ID is string of exactly 11 characters
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
