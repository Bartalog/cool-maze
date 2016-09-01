package coolmaze

import (
	"fmt"
	"time"

	"golang.org/x/net/context"

	"google.golang.org/appengine/datastore"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/memcache"
)

// The app persistent state consists in a store of
// (qrKey, chanID) pairs.
//
// Pairs are stored in Memcache and Datastore.
// Pairs are read preferably from Memcache, with
// a necessary fallback to Datastore (because Memcache
// values get randomly evicted).

func init() {
}

func generatePair(c context.Context) (qrKey, chanID string, err error) {
	//
	// a) Generate non-existing random pair
	//
	for length := 5; length <= 10; length++ {
		qrKey = randomQrKey(length)

		if found, _, _ := getChanID(c, qrKey); found {
			// This is a random collision.
			// Let's try again with a slightly longer qrKey.
			continue
		}

		// Unique qrKey :)
		break
	}
	// We don't do (yet) collision check for the long chanID
	chanID = randomChanID()

	//
	// b) Put it in Memcache
	//
	cacheKey := "qrKey_" + qrKey
	cacheItem := &memcache.Item{
		Key:        cacheKey,
		Value:      []byte(chanID),
		Expiration: mcPairTTL,
	}
	err = memcache.Set(c, cacheItem)
	if err != nil {
		log.Warningf(c, "Failed setting cache[%v] : %v", cacheKey, err)
		return "", "", err
	}

	//
	// c) Put it in Datastore
	//
	dsKey := datastore.NewKey(c, "CMPair", qrKey, 0, nil)
	pair := &CMPair{
		QrKey:    qrKey,
		ChanID:   chanID,
		Creation: time.Now(),
	}
	_, err = datastore.Put(c, dsKey, pair)
	if err != nil {
		log.Warningf(c, "Failed setting datastore[%v] : %v", qrKey, err)
		// Well, the value is in Memcache, so let's
		// no give up the use case.
	}
	// TODO create a delayed task to delete this entry in dsPairTTL

	// There is a small TOCTOU between (a) and (c), but oh well.
	return
}

func getChanID(c context.Context, qrKey string) (found bool, chanID string, err error) {
	var errMC, errDS error

	//
	// a) Look in Memcache
	//
	cacheKey := "qrKey_" + qrKey
	var cacheItem *memcache.Item
	cacheItem, errMC = memcache.Get(c, cacheKey)
	if errMC == nil {
		found = true
		chanID = string(cacheItem.Value)
		return
	}
	if errMC == memcache.ErrCacheMiss {
		log.Infof(c, "Not in cache: [%v]", cacheKey)
		// Okay, maybe recently evicted ... let's look in the Datastore.
	} else {
		log.Warningf(c, "Failed getting cache[%v] : %v", cacheKey, errMC)
		err = errMC
		// Okay, Memcache broken ... let's look in the Datastore, then.
	}

	//
	// b) Look in Datastore
	//
	dsKey := datastore.NewKey(c, "CMPair", qrKey, 0, nil)
	var pair CMPair
	errDS = datastore.Get(c, dsKey, &pair)
	if errDS == datastore.ErrNoSuchEntity {
		// Not in MC, not in DS
		log.Infof(c, "Not in datastore: [%v]", qrKey)
		return
	}
	if errDS != nil {
		log.Warningf(c, "Failed reading datastore[%v] : %v", qrKey, err)
		err = errDS
		return
	}
	if time.Since(pair.Creation) > dsPairTTL {
		log.Warningf(c, "Removing from Datastore expired pair datastore %s", pair.String())
		errDel := datastore.Delete(c, dsKey)
		if errDel != nil {
			log.Warningf(c, "Failed deletion : %v", err)
		}
		return
	}
	found = true
	err = nil
	chanID = pair.ChanID

	return
}

type CMPair struct {
	QrKey    string
	ChanID   string
	Creation time.Time
}

func (pair CMPair) String() string {
	date := pair.Creation.Format("2006-01-02 15:04:05")
	return fmt.Sprintf("[%s, %s, %s]", pair.QrKey, pair.ChanID, date)
}

var mcPairTTL = 24 * time.Hour
var dsPairTTL = 24 * time.Hour
