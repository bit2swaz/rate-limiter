import app from './app';

const PORT = process.env.PORT ?? '3000';

app.listen(Number(PORT), () => {
  console.log(`server listening on port ${PORT}`);
});
