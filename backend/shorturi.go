package coolmaze

import (
	"fmt"
	"net/http"

	"golang.org/x/net/context"
	"google.golang.org/appengine"
	"google.golang.org/appengine/datastore"
)

func init() {
	http.HandleFunc("/r/", shortBounce)
}

// shorten produces a RELATIVE shortUri that will redirect to uri
func shorten(c context.Context, uri string) (string, error) {
	// Implementation "bounce via backend": not super short.
	// But still shorter than full GCS signed URL.
	shortKey := randomString12()
	shortUri := "/r/" + shortKey

	k := datastore.NewKey(c, "ShortUri", shortKey, 0, nil)
	entity := &ShortUri{
		Key:  shortKey,
		Long: uri,
	}

	_, err := datastore.Put(c, k, entity)
	if err != nil {
		return "", err
	}

	return shortUri, nil
}

type ShortUri struct {
	Key, Long string
}

// shortBounce handles a short URI, looks up (short key -> full URI) mapping in Datastore,
// and redirects to full URI.
func shortBounce(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	s := r.RequestURI
	shortKey := s[len("/r/"):]
	k := datastore.NewKey(c, "ShortUri", shortKey, 0, nil)
	entity := ShortUri{}
	err := datastore.Get(c, k, &entity)
	if err == datastore.ErrNoSuchEntity {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprintf(w, "No URL entry for short key: %q\n", shortKey)
		return
	}
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Server failed :(")
		return
	}
	fullUrl := entity.Long
	http.Redirect(w, r, fullUrl, http.StatusFound)
}
