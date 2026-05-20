import { Router } from 'express';

import axios from 'axios';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const token =
      req.headers.authorization;

    const response = await axios.get(
      'https://nira.zeit.com.br/api/v1/filter-data',
      {
        headers: {
          Authorization: token,
        },
      },
    );

    return res.json(response.data);
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          'Erro ao buscar filtros',
      });
  }
});

export default router;