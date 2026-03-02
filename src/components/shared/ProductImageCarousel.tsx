import * as React from 'react';
import type { ProductImage } from '../../types';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../ui/carousel';

interface ProductImageCarouselProps {
  images: ProductImage[];
  productTitle: string;
  className?: string;
}

function ProductImageCarousel({ images, productTitle, className }: ProductImageCarouselProps) {
  if (images.length === 0) {
    return <p className="text-gray-400 text-[13px]">No images</p>;
  }

  if (images.length === 1) {
    return (
      <img
        src={images[0].url}
        alt={images[0].alt ?? productTitle}
        className="w-32 h-32 object-cover rounded border border-gray-200"
      />
    );
  }

  return (
    <Carousel opts={{ loop: true }} className={className}>
      <CarouselContent>
        {images.map((img, i) => (
          <CarouselItem key={i}>
            <img
              src={img.url}
              alt={img.alt ?? `${productTitle} - Image ${i + 1}`}
              className="w-32 h-32 object-cover rounded border border-gray-200"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-1 top-1/2 -translate-y-1/2" />
      <CarouselNext className="right-1 top-1/2 -translate-y-1/2" />
    </Carousel>
  );
}

export { ProductImageCarousel };
