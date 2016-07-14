package coolmaze

import (
	"fmt"
	"net/http"
	"strconv"

	"golang.org/x/net/context"

	"google.golang.org/cloud/pubsub"
)
import "github.com/pusher/pusher-http-go"
import "google.golang.org/appengine"
import (
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/urlfetch"
)

func init() {
	http.HandleFunc("/dispatch", dispatch)
	http.HandleFunc("/ack", ackReception)
}

// Note that AppEngine doesn't support response streaming.
// The "dispatch" http response will be 1-shot.
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
	log.Infof(c, "Sending to chan [%v] message [%v]", channelID, message)

	client := pusher.Client{
		AppId:      "197093",
		Key:        "e36002cfca53e4619c15",
		Secret:     secret,
		HttpClient: urlfetchClient,
	}

	data := map[string]string{"message": message}
	be, err := client.Trigger(channelID, event, data)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Encountered error:", err)
		return
	}
	log.Infof(c, "Events = %v", be)
	fmt.Fprintln(w, "Done :)")
}

// Browser posts acknowledgement when it receives a message
// from Pusher.
func ackReception(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}

	channelID := r.FormValue("chanID")
	if channelID == "" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: chanID")
		return
	}

	c := appengine.NewContext(r)

	err := pubAck(c, channelID)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Encountered error:", err)
		return
	}
}

func pubAck(c context.Context, chanID string) error {
	client, err := pubsub.NewClient(c, "cool-maze")
	if err != nil {
		return err
	}

	topic, err := client.NewTopic(c, chanID)
	if err != nil {
		return err
	}

	_, err = topic.Publish(c, &pubsub.Message{
		Data: []byte("ack"),
	})
	if err != nil {
		return err
	}

	return nil
}

var secret string
