import * as React from 'react';
import type { ProductImage } from '../../types';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '../ui/carousel';

interface ProductImageCarouselProps {
  images: ProductImage[];
  productTitle: string;
  className?: string;
}

function ProductImageCarousel({ images, productTitle, className }: ProductImageCarouselProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  if (images.length === 0) {
    return <p className="text-muted-foreground text-[13px]">No images</p>;
  }

  if (images.length === 1) {
    return (
      <img
        src={images[0].url}
        alt={images[0].alt ?? productTitle}
        className="w-full h-full object-contain"
      />
    );
  }

  return (
    <div className={className}>
      <Carousel setApi={setApi} opts={{ loop: true }} className="w-full">
        <CarouselContent>
          {images.map((img, i) => (
            <CarouselItem key={i}>
              <img
                src={img.url}
                alt={img.alt ?? `${productTitle} - Image ${i + 1}`}
                className="w-full h-full object-contain"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-1 top-1/2 -translate-y-1/2" />
        <CarouselNext className="right-1 top-1/2 -translate-y-1/2" />
      </Carousel>
      <Carousel className="w-full mt-2" opts={{ loop: true }}>
        <CarouselContent className="-ml-2">
          {images.map((img, i) => (
            <CarouselItem key={i} className="pl-2 basis-1/5">
              <button
                data-index={i}
                onClick={() => api?.scrollTo(i)}
                className={`w-full aspect-square border-2 rounded overflow-hidden ${
                  i === current ? 'border-primary' : 'border-transparent'
                }`}
              >
                <img
                  src={img.url}
                  alt={img.alt ?? `${productTitle} - Thumbnail ${i + 1}`}
                  className="w-full h-full object-contain"
                />
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}

export { ProductImageCarousel };
