import { Injectable } from '@nestjs/common';

import twilio from 'twilio';

const TWILIO_AUTH_TOKEN =
      process.env.TWILIO_AUTH_TOKEN;

  const TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

@Injectable()
export class TwilioService {
  async sendMessage(
    to: string,
    message: string,
  ) {

    if (!TWILIO_AUTH_TOKEN || !TWILIO_ACCOUNT_SID) {
      console.warn(
        'WhatsApp não configurado. Mensagem não enviada.',
      );

      return;
    }
    console.log(`Enviando mensagem para ${to}: ${message}`);
    try{
    await client.messages
    .create({
      from: 'whatsapp:+14155238886',
      body: message,
      to: `whatsapp:+${to}`,
    })
    .then(message => console.log(message.sid));
  } catch (error: any) {
    console.error(
      'WhatsApp send message ERROR:',
      error.response?.data || error?.message,
    );

    throw error;
  }
  } 
}