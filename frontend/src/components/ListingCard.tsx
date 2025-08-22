import { Card, CardActionArea, CardMedia, CardContent, Typography, Box, Rating } from '@mui/material';
import { motion, Variants } from 'framer-motion';
import { Business } from '../types';

interface ListingCardProps {
  business: Business;
  onViewDetails: () => void;
}

const cardVariants: Variants = {
  initial: { opacity: 0, y: 50 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  exit: { opacity: 0, y: -50, transition: { duration: 0.3, ease: 'easeIn' } },
  hover: { y: -10, boxShadow: '0px 20px 30px rgba(0,0,0,0.15)', transition: { type: 'spring', stiffness: 200 } }
};

const ListingCard = ({ business, onViewDetails }: ListingCardProps) => {
  // --- INICIO DE LA CORRECCIÓN ---
  const averageRating = business.avg_rating || 0;
  const reviewCount = business.reviews_count || 0;
  const imageUrl = business.logo_url || 'https://via.placeholder.com/300x180.png?text=Sin+Imagen';
  // --- FIN DE LA CORRECCIÓN ---

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover="hover"
      layout
      style={{ height: '100%' }}
    >
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 4, overflow: 'hidden' }}>
        <CardActionArea onClick={onViewDetails} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          
          <CardMedia
            component="img"
            height="180"
            image={imageUrl}
            alt={`Imagen de ${business.name}`}
            sx={{ objectFit: 'cover' }}
          />

          <CardContent sx={{ flexGrow: 1, width: '100%' }}>
            <Typography gutterBottom variant="h6" component="div" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {business.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 1 }}>
              {business.description}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 'auto' }}>
              {/* --- INICIO DE LA CORRECCIÓN --- */}
              <Rating value={averageRating} precision={0.5} readOnly size="small" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                ({reviewCount})
              </Typography>
              {/* --- FIN DE LA CORRECCIÓN --- */}
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </motion.div>
  );
};

export default ListingCard;