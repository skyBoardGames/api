import amqplib from 'amqplib';
import dotenv from "dotenv"
import { logger } from './config/winston.config.js';

dotenv.config();

// export interface IGameWon {
//     lobbyId: mongoose.Types.ObjectId;
//     winnerId: mongoose.Types.ObjectId;
// }

// export interface IStartTournamentNotification {
//     email: string;
//     message: string;
// }

// export interface ITournamentFixtureWon {
//     fixtureId: mongoose.Types.ObjectId;
//     winnerId: mongoose.Types.ObjectId;
// }


let channel;

const RABBITMQ_DEFAULT_USER = process.env.RABBITMQ_DEFAULT_USER;
const RABBITMQ_DEFAULT_PASS = process.env.RABBITMQ_DEFAULT_PASS;
const RABBITMQ_SLUG = process.env.RABBITMQ_SLUG;

const RABBITMQ_URL = `amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@${RABBITMQ_SLUG}:5672`

const init = async (tries = 0) => {
    console.log("trying");
    try {
        console.log("trying rabitmq connection");
        const connection = await amqplib.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log("connected to channel");
    } catch (error) {
        if (error.code === 'ECONNREFUSED' && tries < 50) {
            console.log("trying again");

            setTimeout(() => init(tries + 1), 1500);
            
            return;
        }
        else {
            console.error("error on rabbit mq connection", error);
        }
    }
};

// type queueType =
//   | 'game-info-win'
//   | 'tournament-started-notification'
//   | 'tournament-info-win';

export const publish_to_queue = async (
    queueName/*:  queueType */,
    data/* : IGameWon | IStartTournamentNotification | ITournamentFixtureWon */,
    queueIsDurable/* : boolean */,
    options/* ?: amqplib.Options.Publish */
) => {
    if (!channel) {
        await init(); // Ensure the channel is initialized before trying to send a message
    }

    logger.info("publishing to queue, queue name " + queueName);

    logger.info("data for queue", {data})

    channel.assertQueue(queueName, { durable: queueIsDurable });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));

    logger.info("Done");
};

// Initialize the connection and channel when the module is loaded
init().catch(err =>
    console.error("error connecting: " + err)
);
