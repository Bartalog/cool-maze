package coolmaze

import (
	"fmt"
	"net/http"
	"strconv"
)
import "github.com/pusher/pusher-http-go"
import "appengine"
import "appengine/urlfetch"

func init() {
	http.HandleFunc("/dispatch", dispatch)
}

func dispatch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}

	channelID := r.FormValue("chanID")
	event := "maze-cast"
	message := r.FormValue("message")

	if channelID == "" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: chanID")
		return
	}
	if message == "" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: message")
		return
	}
	if _, err := strconv.Atoi(channelID); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "channelID must be an integer")
		return
	}

	c := appengine.NewContext(r)
	urlfetchClient := urlfetch.Client(c)
	c.Infof("Sending to chan [%v] message [%v]", channelID, message)

	client := pusher.Client{
		AppId:      "197093",
		Key:        "e36002cfca53e4619c15",
		Secret:     secret,
		HttpClient: urlfetchClient,
	}

	data := map[string]string{"message": message}
	be, err := client.Trigger(channelID, event, data)
	if err != nil {
		c.Errorf("%v", err)
		return
	}
	c.Infof("Events = %v", be)
}

var secret string
