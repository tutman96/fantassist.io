package main

import (
	"context"
	"fmt"
	_ "net/http/pprof"
	"os"
	"os/signal"

	"github.com/tutman96/fantassist.io/tracker/pkg"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		interrupt := make(chan os.Signal, 1)
		signal.Notify(interrupt, os.Interrupt)
		<-interrupt
		fmt.Println("Shutting down...")
		cancel()
	}()

	sm, err := pkg.NewStateMachine()
	if err != nil {
		panic(err)
	}

	err = sm.Start(ctx)
	if err != nil {
		panic(err)
	}

	fmt.Println("Started tracker")

	<-ctx.Done()
}
