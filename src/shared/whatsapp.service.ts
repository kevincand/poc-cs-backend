import { Injectable } from '@nestjs/common';

import axios from 'axios';

@Injectable()
export class WhatsappService {
  async sendMessage(
    to: string,
    message: string,
  ) {
    const token =
      process.env.WHATSAPP_ACCESS_TOKEN;

    const phoneNumberId =
      process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.warn(
        'WhatsApp não configurado. Mensagem não enviada.',
      );

      return;
    }
    console.log(`Enviando mensagem para ${to}: ${message}`);
    try{
    await axios.post(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',

        to,

        type: 'text',

        text: {
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,

          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error: any) {
    console.error(
      'WhatsApp send message ERROR:',
      error.response?.data || error?.message,
    );

    throw error;
  }
  } 
}