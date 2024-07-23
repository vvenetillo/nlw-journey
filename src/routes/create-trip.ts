import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import 'dayjs/locale/pt-br'
import dayjs from "dayjs";
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";
import nodemailer from "nodemailer";


dayjs.extend(localizedFormat)
dayjs.locale('pt-br')


export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips",
    {
      schema: {
        body: z.object({
          destination: z.string().min(4),
          starts_at: z.coerce.date(),
          ends_at: z.coerce.date(),
          owner_name: z.string(),
          owner_email: z.string().email(),
          emails_to_invite: z.array(z.string().email()),
        }),
      },
    },
    async (request) => {
      const { destination, starts_at, ends_at, owner_name, owner_email, emails_to_invite } =
        request.body;

      if (dayjs(starts_at).isBefore(new Date())) {
        throw new Error("Data inválida");
      }

      if (dayjs(ends_at).isBefore(starts_at)) {
        throw new Error("A data de retorno não pode ser antes do embarque");
      }

      const trip = await prisma.trip.create({
        data: {
          destination,
          starts_at,
          ends_at,
          participants: {
            createMany:{
              data: [
                {
                  name: owner_name,
                  email: owner_email,
                  is_owner: true,
                  id_confirmed: true,
                },
                ...emails_to_invite.map(email =>{
                  return { email }
                })
              ]
            }
          },
        },
      });
      
      
      const formattedStartDate = dayjs(starts_at).format('LL')
      const formattedEndDate = dayjs(ends_at).format('LL')

      const confirmationLink = `http://localhost:3001/trips/${trip.id}/confirm`


      const mail = await getMailClient();

      const message = await mail.sendMail({
        from: {
          name: "Equipe bravo",
          address: "oi@oi.com",
        },
        to: {
          name: owner_name,
          address: owner_email,
        },
        subject: `Confirme sua viagem para ${destination}`,
        html: `<div style="font-family: sans-serif; font-size: 16px ; line-height: 1.6;">
    <p> Você solicitou a criação de uma viagem para <strong> ${destination}</strong>, Brasil nas datas de <strong> ${formattedStartDate} </strong> a <strong> ${formattedEndDate} </strong> de Agosto de 2024.</p>
    <p></p>
    <p>Para confirmar sua viagem, clique no link abaixo:</p>
    <p></p>
    <p><a href=${confirmationLink}>Confirmar viagem</a></p>

    <p></p>
    <p>Aplicativo para Iphone</p>
    <p>Aplicativo para Android</p>
    <p></p>

    <p>Caso você ainda não saiba do que se trata esse e-mail, apenas ignore.</p>
</div>`,
      });

      console.log(nodemailer.getTestMessageUrl(message));

      return { tripId: trip.id };
    }
  );
}
