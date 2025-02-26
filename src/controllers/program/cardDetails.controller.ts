import type { NextFunction, Request, Response } from 'express';
import { HttpException } from '../../utils/errors.js';
import { decryptSecret, fetchAndParse, generateSessionId } from '../../utils/helpers.js';
import { Controller } from '../../types/controller.class.js';
import config from '../../config/config.js';

export class CardDetailsController extends Controller {

    public getCardDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.body.id as string;
            if (!id) {
                throw new HttpException(400, "Card ID is required");
            }

            const jwtToken = req.body.jwtToken as string;
            if (!jwtToken) {
                throw new HttpException(400, "JWT token is required");
            }

            const cardDetails = await this.getCardDetailsFromInternalApi(id, jwtToken);

            res.status(200).json(cardDetails);
            return;
        } catch (error) {
            this.getLogger().error(`Error confirming transaction: ${error}`);
            next(error);
        }
    }

    private getCardDetailsFromInternalApi = async (
        id: string,
        jwtToken: string
    ) => {
        const sessionId = await generateSessionId(config.CARD_PEM!);
    
        const options = {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                accept: 'application/json',
                "Authorization": `Bearer ${jwtToken}`
            },
            body: JSON.stringify({ sessionId: sessionId.sessionId })
        };
        const response = await fetchAndParse(`${config.INTERNAL_API_URL}card/issuing/secrets?id=${id}`, options);
        const decryptedPan = (await decryptSecret(response.encryptedPan.data, response.encryptedPan.iv, sessionId.secretKey))
            .replace(/[^\d]/g, '').slice(0, 16);
    
        const decryptedCvc = (await decryptSecret(response.encryptedCvc.data, response.encryptedCvc.iv, sessionId.secretKey))
            .replace(/[^\d]/g, '').slice(0, 3);
    
        return {
            pan: decryptedPan,
            cvc: decryptedCvc,
        }
    }
}
