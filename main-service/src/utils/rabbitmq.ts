import amqplib from 'amqplib';
import * as Sentry from '@sentry/node';
import {
  IGameWon,
  IStartTournamentNotification,
  ITournamentFixtureWon,
} from '../interfaces/queue';

let channel: amqplib.Channel;

const init = async () => {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL as string);
  channel = await connection.createChannel();
};

type queueType =
  | 'game-info-win'
  | 'tournament-started-notification'
  | 'tournament-info-win';

export const publish_to_queue = async (
  queueName: queueType,
  data: IGameWon | IStartTournamentNotification | ITournamentFixtureWon,
  queueIsDurable: boolean,
  options?: amqplib.Options.Publish
) => {
  if (!channel) {
    await init(); // Ensure the channel is initialized before trying to send a message
  }

  channel.assertQueue(queueName, {durable: queueIsDurable});

  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), options);
};

// Initialize the connection and channel when the module is loaded
init().catch(err =>
  Sentry.captureException(err, {
    level: 'error',
    tags: {source: 'RabbitMQ initialization'},
  })
);
