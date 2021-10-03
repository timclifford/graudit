export const dictonaryReader = (alphabet: string, maxLength: number) => {
  let indexes: any | null = [0];

  const stream = new ReadableStream(
    {
      //@ts-ignore
      async pull(controller) {
        let interval = setInterval(() => {
          let i = 0;

          if (indexes === null) {
            clearInterval(interval);
            controller.close();
            return;
          }

          const chunk = (() => {
            if (!indexes) return null;

            let word: any = indexes.map((index: any) => {
              return alphabet[index];
            });

            if (typeof alphabet === "string") {
              word = word.join("");
            }

            for (let j = 0; j < indexes.length; j++) {
              if (indexes[j] < alphabet.length - 1) {
                indexes[j]++;
                break;
              }

              i = i + 1;
              indexes[j] = 0;
            }

            if (i === indexes.length && indexes[i - 1] === 0) {
              if (indexes.length < maxLength) {
                indexes.push(0);
              } else {
                indexes = null;
              }
            }

            return word;
          })();
          controller.enqueue(chunk);
        });
      },
    },
    {
      highWaterMark: 50000,
    },
  );

  return stream;
};
