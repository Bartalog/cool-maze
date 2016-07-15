package coolmaze

import (
	"golang.org/x/net/context"

	"google.golang.org/cloud/pubsub"
)

func pubAck(c context.Context, chanID string) error {
	pubsubClient, err := pubsub.NewClient(c, "cool-maze")
	if err != nil {
		return err
	}

	topic, err := pubsubClient.NewTopic(c, chanID)
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

func pubsubSubscribe(c context.Context, chanID string) (*pubsub.Subscription, error) {
	pubsubClient, err := pubsub.NewClient(c, "cool-maze")
	if err != nil {
		return nil, err
	}
	// TODO
	//return pubsubClient.NewSubscription(c, "sub-name", topic, 0, nil)
	_ = pubsubClient
	return nil, nil
}
