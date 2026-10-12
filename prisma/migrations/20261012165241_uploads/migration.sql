-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "attachedToResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_ownerUserId_idx" ON "Upload"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

