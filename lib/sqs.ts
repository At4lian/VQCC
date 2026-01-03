import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function enqueueAnalysisJob(jobId: string) {
  const QueueUrl = process.env.SQS_QUEUE_URL!;
  const cmd = new SendMessageCommand({
    QueueUrl,
    MessageBody: JSON.stringify({ jobId }),
  });

  // syntax odpovídá AWS SDK v3 (SendMessageCommand) :contentReference[oaicite:5]{index=5}
  return sqs.send(cmd);
}
