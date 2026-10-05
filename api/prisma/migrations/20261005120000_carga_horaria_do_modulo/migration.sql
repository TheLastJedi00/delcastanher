-- Spec 023, Parte D: carga horaria por modulo, para o diploma de modulo.
--
-- So adicao: coluna nula, sem default. Nulo e "a definir" (o diploma mostra o
-- placeholder), e o site publicado segue funcionando antes do deploy.
ALTER TABLE "modules" ADD COLUMN "workloadHours" INTEGER;
