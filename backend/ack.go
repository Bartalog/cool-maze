package coolmaze

import (
	"fmt"
	"net/http"
	"time"

	"golang.org/x/net/context"

	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/cloud/pubsub"
)

func init() {
	http.HandleFunc("/ack", ackReception)
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

// We've sent the message on the Pusher channel,
// now we expect the target to post an ack.
func waitForAck(c context.Context, sub *pubsub.Subscription, chanID string) error {
	// TODO
	time.Sleep(1 * time.Second)
	return nil
}
