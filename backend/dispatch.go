package coolmaze

import (
	"fmt"
	"net/http"
	"strconv"

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

	channelID := r.FormValue("chanID")
	event := "maze-scan"

	if channelID == "" {
		log.Warningf(c, "Missing mandatory parameter: chanID")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: chanID")
		return
	}

	if !isValidChanID(channelID) {
		log.Warningf(c, "channelID [%s] is not a valid chan ID", channelID)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "channelID must be a valid chan ID")
		return
	}

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

	channelID := r.FormValue("chanID")
	event := "maze-cast"
	message := r.FormValue("message")

	if channelID == "" {
		log.Warningf(c, "Missing mandatory parameter: chanID")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: chanID")
		return
	}
	if message == "" {
		log.Warningf(c, "Missing mandatory parameter: message")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: message")
		return
	}
	if !isValidChanID(channelID) {
		log.Warningf(c, "channelID [%s] is not a valid chan ID", channelID)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "channelID must be a valid chan ID")
		return
	}

	urlfetchClient := urlfetch.Client(c)
	log.Infof(c, "Sending to chan [%v] message [%v]", channelID, message)

	pusherClient := pusher.Client{
		AppId:      pusherAppID,
		Key:        pusherKey,
		Secret:     pusherSecret,
		HttpClient: urlfetchClient,
	}

	/*
		sub, errSub := pubsubSubscribe(c, channelID)
		if errSub != nil {
			log.Warningf(c, "Problem with pubsub sub: %v", errSub)
		}
	*/

	data := map[string]string{"message": message}
	be, err := pusherClient.Trigger(channelID, event, data)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Encountered error:", err)
		return
	}
	log.Infof(c, "Pusher events = %v", be)

	/*
		if errSub == nil {
			err = waitForAck(c, sub, channelID)
			if err != nil {
				log.Errorf(c, "%v", err)
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintln(w, "Encountered error:", err)
				return
			}
		}
	*/

	fmt.Fprintln(w, "Done :)")
}

// isValidChanID validates a string encoded in a QR-code on page coolmaze.net .
// Currently a valid chan ID is an int in range [0..99999].
func isValidChanID(s string) bool {
	_, err := strconv.Atoi(s)
	return err == nil
}
