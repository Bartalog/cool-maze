package coolmaze

import "net/http"
import "github.com/pusher/pusher-http-go"
import "appengine"
import "appengine/urlfetch"

func init() {
	http.HandleFunc("/dispatch", dispatch)
}

func dispatch(w http.ResponseWriter, r *http.Request) {
	// TODO: allow POST only.
	channelID := r.FormValue("chanID")
	event := "maze-cast"
	message := r.FormValue("message")

	c := appengine.NewContext(r)
	urlfetchClient := urlfetch.Client(c)
	c.Infof("Sending to chan [%v] message [%v]", channelID, message)

	w.Header().Set("Access-Control-Allow-Origin", "*")
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
