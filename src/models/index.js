// src/models/index.js
import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

// import từng model
import userModel from "./user.model.js";
import titleModel from "./title.model.js";
import genreModel from "./genre.model.js";
import titleGenreModel from "./titleGenre.model.js";
import seasonModel from "./season.model.js";
import episodeModel from "./episode.model.js";
import personModel from "./person.model.js";
import creditModel from "./credit.model.js";
import imageModel from "./image.model.js";
import mediaOriginModel from "./mediaOrigin.model.js";
import mediaVariantModel from "./mediaVariant.model.js";
import watchHistoryModel from "./watchHistory.model.js";
import favoriteModel from "./favorite.model.js";
import ratingModel from "./rating.model.js";
import reviewModel from "./review.model.js";
import planModel from "./plan.model.js";
import subscriptionModel from "./subscription.model.js";
import paymentModel from "./payment.model.js";
import reportModel from "./report.model.js";
import vTitlePublicModel from "./vTitlePublic.model.js";
import vEpisodeEffectiveAccessModel from "./vEpisodeEffectiveAccess.model.js";
import userRecommendationModel from "./userRecommendation.model.js";

// khởi tạo model
const User = userModel(sequelize, DataTypes);
const Title = titleModel(sequelize, DataTypes);
const Genre = genreModel(sequelize, DataTypes);
const TitleGenre = titleGenreModel(sequelize, DataTypes);
const Season = seasonModel(sequelize, DataTypes);
const Episode = episodeModel(sequelize, DataTypes);
const Person = personModel(sequelize, DataTypes);
const Credit = creditModel(sequelize, DataTypes);
const Image = imageModel(sequelize, DataTypes);
const MediaOrigin = mediaOriginModel(sequelize, DataTypes);
const MediaVariant = mediaVariantModel(sequelize, DataTypes);
const WatchHistory = watchHistoryModel(sequelize, DataTypes);
const Favorite = favoriteModel(sequelize, DataTypes);
const Rating = ratingModel(sequelize, DataTypes);
const Review = reviewModel(sequelize, DataTypes);
const Plan = planModel(sequelize, DataTypes);
const Subscription = subscriptionModel(sequelize, DataTypes);
const Payment = paymentModel(sequelize, DataTypes);
const Report = reportModel(sequelize, DataTypes);
const VTitlePublic = vTitlePublicModel(sequelize, DataTypes);
const VEpisodeEffectiveAccess = vEpisodeEffectiveAccessModel(sequelize, DataTypes);
const UserRecommendation = userRecommendationModel(sequelize, DataTypes);

/* ========== Associations ========== */

// User
User.hasMany(Subscription, { foreignKey: "user_id" });
Subscription.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Payment, { foreignKey: "user_id" });
Payment.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(WatchHistory, { foreignKey: "user_id" });
WatchHistory.belongsTo(User, { foreignKey: "user_id" });

// User - Review
User.hasMany(Review, { foreignKey: "user_id", as: "reviews" });
Review.belongsTo(User, { foreignKey: "user_id", as: "user" });

User.hasMany(Rating, { foreignKey: "user_id" });
Rating.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Favorite, { foreignKey: "user_id" });
Favorite.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Report, { foreignKey: "reporter_id", as: "reportedReports" });
Report.belongsTo(User, { foreignKey: "reporter_id", as: "reporter" });

User.hasMany(Report, { foreignKey: "handled_by", as: "handledReports" });
Report.belongsTo(User, { foreignKey: "handled_by", as: "handler" });

// Title - Season - Episode
Title.hasMany(Season, { foreignKey: "title_id" });
Season.belongsTo(Title, { foreignKey: "title_id" });

Season.hasMany(Episode, { foreignKey: "season_id" });
Episode.belongsTo(Season, { foreignKey: "season_id" });

// Title - Review (NEW, theo DB mới: reviews.title_id NOT NULL)
Title.hasMany(Review, { foreignKey: "title_id", as: "reviews" });
Review.belongsTo(Title, { foreignKey: "title_id", as: "title" });

// Title - Genres (many-to-many)
Title.belongsToMany(Genre, {
  through: TitleGenre,
  foreignKey: "title_id",
  otherKey: "genre_id",
  as: "genres",
});
Genre.belongsToMany(Title, {
  through: TitleGenre,
  foreignKey: "genre_id",
  otherKey: "title_id",
  as: "titles",
});

// Title - Credits - Person
Title.hasMany(Credit, { foreignKey: "title_id" });
Credit.belongsTo(Title, { foreignKey: "title_id" });

Person.hasMany(Credit, { foreignKey: "person_id" });
Credit.belongsTo(Person, { foreignKey: "person_id" });

// Title - rating / favorite / history
Title.hasMany(Rating, { foreignKey: "title_id" });
Rating.belongsTo(Title, { foreignKey: "title_id" });

Title.hasMany(Favorite, { foreignKey: "title_id" });
Favorite.belongsTo(Title, { foreignKey: "title_id" });

Title.hasMany(WatchHistory, { foreignKey: "title_id" });
WatchHistory.belongsTo(Title, { foreignKey: "title_id" });

// Episode - history
Episode.hasMany(WatchHistory, { foreignKey: "episode_id" });
WatchHistory.belongsTo(Episode, { foreignKey: "episode_id" });

// Episode - review (episode_id có thể NULL)
Episode.hasMany(Review, { foreignKey: "episode_id", as: "episodeReviews" });
Review.belongsTo(Episode, { foreignKey: "episode_id", as: "episode" });

// Plan - Subscription
Plan.hasMany(Subscription, { foreignKey: "plan_id" });
Subscription.belongsTo(Plan, { foreignKey: "plan_id" });

// Subscription - Payment
Subscription.hasMany(Payment, { foreignKey: "subscription_id" });
Payment.belongsTo(Subscription, { foreignKey: "subscription_id" });

// User - Recommendations
User.hasMany(UserRecommendation, { foreignKey: "user_id" });
UserRecommendation.belongsTo(User, { foreignKey: "user_id" });

// Title - Recommendations
Title.hasMany(UserRecommendation, { foreignKey: "title_id" });
UserRecommendation.belongsTo(Title, { foreignKey: "title_id" });

// MediaOrigin - MediaVariant
MediaOrigin.hasMany(MediaVariant, { foreignKey: "origin_id" });
MediaVariant.belongsTo(MediaOrigin, { foreignKey: "origin_id" });

// export tất cả
export {
  sequelize,
  User,
  Title,
  Genre,
  TitleGenre,
  Season,
  Episode,
  Person,
  Credit,
  Image,
  MediaOrigin,
  MediaVariant,
  WatchHistory,
  Favorite,
  Rating,
  Review,
  Plan,
  Subscription,
  Payment,
  Report,
  UserRecommendation,
  VTitlePublic,
  VEpisodeEffectiveAccess,
};

export default sequelize;
