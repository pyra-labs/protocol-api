
import { decryptSecret, fetchAndParse, generateSessionId } from '../../../utils/helpers.js';
import config from '../../../config/config.js';


export const getCardDetailsFromInternalApi = async (
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
