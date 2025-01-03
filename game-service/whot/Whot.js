import MainServerLayer from "../MainServerLayer.js";
import initializeDeck from "./functions/initializeDeck.js"
import reverseState from "./functions/reverseState.js";
import GameModel from "./models/game.model.js";

export default class Whot {
  // static async addRoom(roomID, setup, ludoRooms) {
  //   const roomObject = {
  //       roomID: roomID,
  //       setup: setup
  //   }

  //   ludoRooms.push(roomObject);

  //   console.log(roomObject);

  //   const gameModel = new GameModel({
  //       game_name: "Ludo",
  //       players: [],
  //       roomID: roomID
  //   });

  //   await gameModel.save();
  // }

  static activate(io, whotNamespace) {
    let rooms = [];

    whotNamespace.on("connection", (socket) => {
      console.log("a user connected to whot server");
      socket.on('disconnect', () => {
        console.log("user disconnected from whot", socket.id);

        console.log(rooms[0].players);

        const room = rooms.find(room => room.players.includes(room.players.find(player => player.socketId == socket.id)));

        console.log(room);
        if (!room) return;

        io.emit('remove', 'whot', room.room_id);
      })
      socket.on("join_room", async ({ room_id, storedId, username, avatar }) => {
        if (room_id?.length != 6) {
          whotNamespace.to(socket.id).emit(
            "error",
            "Sorry! Seems like this game link is invalid. Just go back and start your own game 🙏🏾."
          );
          return;
        }

        socket.join(room_id);
        let currentRoom = rooms.find((room) => room.room_id == room_id);
        console.log("is there a room?", currentRoom);
        if (currentRoom) {
          let currentPlayers = currentRoom.players;

          if (currentPlayers.length == 1) {
            // If I'm the only player in the room, get playerOneState, and update my socketId
            if (currentPlayers[0].storedId == storedId) {
              whotNamespace.to(socket.id).emit("dispatch", {
                type: "INITIALIZE_DECK",
                payload: currentRoom.playerOneState,
              });

              rooms = rooms.map((room) => {
                if (room.room_id == room_id) {
                  return {
                    ...room,
                    players: [{ storedId, socketId: socket.id, player: "one" }],
                  };
                }
                return room;
              });
            }
            else {
              console.log("joining already created game");
              rooms = rooms.map((room) => {
                if (room.room_id == room_id) {
                  return {
                    ...room,
                    players: [
                      ...room.players,
                      { storedId, socketId: socket.id, player: "two", username: username, avatar: avatar },
                    ],
                  };
                }
                return room;
              });

              currentRoom = rooms.find((room) => room.room_id == room_id);
              currentPlayers = currentRoom.players;

              console.log("room after adding new player", currentRoom);
              console.log("current players", currentPlayers);

              whotNamespace.to(socket.id).emit("dispatch", {
                type: "INITIALIZE_DECK",
                payload: reverseState(currentRoom.playerOneState),
              });

              // Check if my opponent is online
              socket.broadcast.to(room_id).emit("confirmOnlineState");

              const opponent = currentPlayers.find(player => player.storedId != storedId)
              console.log("opponent", opponent);

              let opponentSocketId = opponent.socketId;
              whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);

              let playerOneInfo = currentPlayers[0];
              let playerTwoInfo = currentPlayers[1];

              currentRoom.turn = 1;

              whotNamespace.to(room_id).emit("start", playerOneInfo, playerTwoInfo, currentRoom.turn);

              const lobbyID = await MainServerLayer.getLobbyID(room_id);

              await MainServerLayer.startGame(lobbyID);

              console.log("done sending info to main server");
            }
          }
          else {
            // Check if player can actually join room, after joining, update his socketId
            let currentPlayer = currentPlayers.find(
              (player) => player.storedId == storedId
            );
            if (currentPlayer) {
              whotNamespace.to(socket.id).emit("dispatch", {
                type: "INITIALIZE_DECK",
                payload:
                  currentPlayer.player == "one"
                    ? currentRoom.playerOneState
                    : reverseState(currentRoom.playerOneState),
              });

              rooms = rooms.map((room) => {
                if (room.room_id == room_id) {
                  return {
                    ...room,
                    players: [...room.players].map((player) => {
                      if (player.storedId == storedId) {
                        return {
                          storedId,
                          socketId: socket.id,
                          player: currentPlayer.player,
                        };
                      }
                      return player;
                    }),
                  };
                }
                return room;
              });

              let opponentSocketId = currentPlayers.find(
                (player) => player.storedId != storedId
              ).socketId;

              whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);

              // Check if my opponent is online
              socket.broadcast.to(room_id).emit("confirmOnlineState");
            }
            else {
              whotNamespace.to(socket.id).emit(
                "error",
                "Sorry! There are already two players on this game, just go back and start your own game 🙏🏾."
              );
            }
          }
        }
        else {
          // Add room to store
          const { deck, userCards, usedCards, opponentCards, activeCard } = initializeDeck();

          const playerOneState = {
            deck,
            userCards,
            usedCards,
            opponentCards,
            activeCard,
            whoIsToPlay: "user",
            infoText: "It's your turn to make a move now",
            infoShown: true,
            stateHasBeenInitialized: true,
            player: "one",
          };

          rooms.push({
            room_id,
            players: [
              {
                storedId,
                socketId: socket.id,
                player: "one",
                username: username,
                avatar: avatar
              },
            ],
            playerOneState,
          });

          whotNamespace.to(socket.id).emit("dispatch", {
            type: "INITIALIZE_DECK",
            payload: playerOneState,
          });
        }
      });

      socket.on("sendUpdatedState", (updatedState, room_id) => {
        // console.log("update state", room_id);
        const playerOneState =
          updatedState.player === "one" ? updatedState : reverseState(updatedState);
        const playerTwoState = reverseState(playerOneState);
        rooms = rooms.map((room) => {
          if (room.room_id == room_id) {
            // console.log("is room", room);
            return {
              ...room,
              playerOneState,
            };
          }
          return room;
        });

        socket.broadcast.to(room_id).emit("dispatch", {
          type: "UPDATE_STATE",
          payload: {
            playerOneState,
            playerTwoState,
          },
        });

        
        const currentRoom = rooms.find((room) => room.room_id == room_id);
        currentRoom.turn = playerOneState.infoText == "It's your opponent's turn to make a move now" ? 2 : 1
        // currentRoom.turn = currentRoom.turn == 1 ? 2 : 1;

        // console.log(playerOneState.player, "p1")
        // console.log(playerTwoState.player, "p2")

        whotNamespace.to(room_id).emit('change_turn', currentRoom.turn)
      });

      socket.on("game_over", async (room_id, isWinner) => {
        rooms = rooms.filter((room) => room.room_id != room_id);

        if (isWinner) {
          const gameModel = new GameModel({
            game_name: "whot",
            roomID: room_id,
            players: [
              {
                socketID: socket.id,
                username: "",
                winner: true
              }
            ]
          })

          await gameModel.save();

          const currentRoom = this.rooms.filter(room => room.roomID == room_id)[0];

          const winner = currentRoom.players.find(player => player.socketID == socket.id);

          const winnerData = await USER.findOne({username: winner.username})

          const winnerId = winnerData.toObject()._id

          const lobbyId = await MainServerLayer.getLobbyID(roomID);

          await MainServerLayer.wonGame(lobbyId, winnerId);
        }
      });

      socket.on("disconnect", () => {
        // Find the room the player disconnected from
        let currentRoom = rooms.find((room) =>
          room.players.map((player) => player.socketId).includes(socket.id)
        );
        if (currentRoom) {
          let opponentSocketId = currentRoom.players.find(
            (player) => player.socketId != socket.id
          )?.socketId;
          if (!opponentSocketId) return;
          whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", false);
        }
      });

      socket.on("confirmOnlineState", (storedId, room_id) => {
        let currentRoom = rooms.find((room) => room.room_id == room_id);
        if (currentRoom) {
          let opponentSocketId = currentRoom.players.find(
            (player) => player.storedId != storedId
          ).socketId;
          whotNamespace.to(opponentSocketId).emit("opponentOnlineStateChanged", true);
        }
      });
    });
  }
}