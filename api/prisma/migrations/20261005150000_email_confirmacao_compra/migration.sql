-- Spec 024, decisao D6: quando saiu o e-mail "Compra confirmada".
--
-- So adicao: coluna nula, sem default e sem backfill. Pedidos pagos antes da
-- spec ficam sem o e-mail registrado, e o painel oferece o reenvio.
ALTER TABLE "orders" ADD COLUMN "confirmationEmailedAt" TIMESTAMP(3);
