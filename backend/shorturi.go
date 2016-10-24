package coolmaze

import (
	"golang.org/x/net/context"
	"google.golang.org/appengine/datastore"
)

func shorten(c context.Context, uri string) (string, error) {
	// Implementation "bounce via backend": not super short.
	// But still shorter than full GCS signed URL.
	shortKey := randomString20()
	shortUri := "https://cool-maze.appspot.com/r/" + shortKey

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

// TODO handle /r/* -> 302 redirect
