# Design Document: E-Commerce Platform

## Overview

The e-commerce platform is a full-stack application with a React/Next.js frontend, Node.js backend, and Turso (SQLite) database. The architecture follows a layered approach with clear separation of concerns: presentation layer (React components), business logic layer (API routes and services), and data persistence layer (Turso database). The system integrates with external services (Stripe for payments, DHL/PostNord/DB Schenker for shipping) through dedicated integration layers.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js/React)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Pages      │  │  Components  │  │  State Mgmt  │      │
│  │  (SSR/SSG)   │  │  (Tailwind)  │  │ (Zustand)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────▼─────────────────────────────────────┐
│                  Backend (Node.js/Express)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  API Routes  │  │  Services    │  │  Middleware  │      │
│  │  (REST)      │  │  (Business   │  │  (Auth, Val) │      │
│  │              │  │   Logic)     │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬─────────────────────────────────────┘
                         │ SQL
┌────────────────────────▼─────────────────────────────────────┐
│              Data Layer (Turso/SQLite)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Repositories│  │  Migrations  │  │  Validation  │      │
│  │  (Query)     │  │  (Schema)    │  │  (Constraints)      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘

External Integrations:
├── Stripe API (Payment Processing)
├── DHL API (Shipping)
├── PostNord API (Shipping)
└── DB Schenker API (Shipping)
```

## Components and Interfaces

### Frontend Components

#### Page Components
- **HomePage**: Displays hero banner, featured products, recommendations
- **ProductPage**: Shows product details, variants, images, reviews
- **CartPage**: Displays cart items, quantities, subtotals
- **CheckoutPage**: Handles delivery info, shipping selection, payment
- **OrderHistoryPage**: Lists user's past orders with status
- **AuthPage**: Login and registration forms
- **ProfilePage**: User profile management and address book

#### UI Components
- **Header**: Logo, navigation menu, search bar, user menu, cart icon
- **Footer**: Links, contact info, payment logos, social media, newsletter
- **ProductCard**: Product preview with image, price, rating
- **CartItem**: Individual cart item with quantity controls
- **ImageGallery**: Product images with zoom functionality
- **ShippingOption**: Shipping method selection with pricing
- **PaymentForm**: Stripe payment input (tokenized)

#### State Management (Zustand)
- **cartStore**: Cart items, quantities, totals
- **userStore**: Authentication state, user profile, addresses
- **uiStore**: Modal states, loading indicators, notifications

### Backend Services

#### Authentication Service
- User registration with email validation
- Password hashing (bcrypt)
- JWT token generation and validation
- Session management
- Token refresh mechanism

#### Product Service
- Product catalog retrieval with filtering
- Search functionality with relevance ranking
- Product variant management
- Inventory status checking
- Review aggregation

#### Cart Service
- Add/remove items from cart
- Update quantities with inventory validation
- Calculate subtotals and totals
- Persist cart state for authenticated users
- Handle unavailable items

#### Checkout Service
- Validate delivery information
- Calculate shipping costs via external APIs
- Apply discounts/promotions
- Prepare order data for payment processing

#### Payment Service
- Stripe integration for payment processing
- Payment intent creation
- Webhook handling for payment confirmations
- Error handling and retry logic
- PCI DSS compliance (no card storage)

#### Shipping Service
- DHL API integration for shipping quotes
- PostNord API integration for shipping quotes
- DB Schenker API integration for shipping quotes
- Real-time tracking information retrieval
- Fallback handling for API failures

#### Order Service
- Order creation and persistence
- Order status management
- Order history retrieval
- Confirmation email sending
- Satisfaction survey triggering

### API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user

#### Products
- `GET /api/products` - List products with pagination
- `GET /api/products/:id` - Get product details
- `GET /api/products/search?q=query` - Search products
- `GET /api/products/:id/variants` - Get product variants
- `GET /api/products/:id/reviews` - Get product reviews

#### Cart
- `GET /api/cart` - Get current cart
- `POST /api/cart/items` - Add item to cart
- `PUT /api/cart/items/:itemId` - Update cart item quantity
- `DELETE /api/cart/items/:itemId` - Remove item from cart
- `DELETE /api/cart` - Clear cart

#### Checkout
- `POST /api/checkout/shipping-options` - Get shipping options
- `POST /api/checkout/validate` - Validate checkout data
- `POST /api/checkout/payment-intent` - Create Stripe payment intent

#### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:id` - Get order details
- `GET /api/orders/:id/tracking` - Get order tracking info
- `POST /api/orders/:id/survey` - Submit satisfaction survey

#### User Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `GET /api/addresses` - Get user addresses
- `POST /api/addresses` - Add address
- `PUT /api/addresses/:id` - Update address
- `DELETE /api/addresses/:id` - Delete address

## Data Models

### User
```
{
  id: UUID (primary key)
  email: string (unique, indexed)
  password_hash: string
  first_name: string
  last_name: string
  phone: string
  created_at: timestamp
  updated_at: timestamp
  is_active: boolean
}
```

### Address
```
{
  id: UUID (primary key)
  user_id: UUID (foreign key → User)
  street: string
  city: string
  postal_code: string
  country: string
  is_default: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

### Product
```
{
  id: UUID (primary key)
  name: string (indexed)
  description: text
  price: decimal
  sku: string (unique)
  category: string (indexed)
  rating: decimal
  review_count: integer
  created_at: timestamp
  updated_at: timestamp
}
```

### ProductImage
```
{
  id: UUID (primary key)
  product_id: UUID (foreign key → Product)
  image_url: string
  alt_text: string
  display_order: integer
  created_at: timestamp
}
```

### ProductVariant
```
{
  id: UUID (primary key)
  product_id: UUID (foreign key → Product)
  variant_type: string (e.g., 'color', 'size')
  variant_value: string (e.g., 'red', 'large')
  sku: string (unique)
  stock_quantity: integer
  created_at: timestamp
  updated_at: timestamp
}
```

### Cart
```
{
  id: UUID (primary key)
  user_id: UUID (foreign key → User, nullable for guests)
  session_id: string (for guest carts)
  created_at: timestamp
  updated_at: timestamp
}
```

### CartItem
```
{
  id: UUID (primary key)
  cart_id: UUID (foreign key → Cart)
  product_id: UUID (foreign key → Product)
  variant_id: UUID (foreign key → ProductVariant, nullable)
  quantity: integer
  price_at_add: decimal
  created_at: timestamp
  updated_at: timestamp
}
```

### Order
```
{
  id: UUID (primary key)
  order_number: string (unique, indexed)
  user_id: UUID (foreign key → User, nullable for guests)
  guest_email: string (nullable)
  delivery_address_id: UUID (foreign key → Address)
  shipping_method: string (e.g., 'DHL', 'PostNord')
  shipping_cost: decimal
  subtotal: decimal
  tax: decimal
  total: decimal
  payment_status: enum ('pending', 'completed', 'failed')
  order_status: enum ('confirmed', 'shipped', 'delivered')
  tracking_number: string (nullable)
  created_at: timestamp
  updated_at: timestamp
}
```

### OrderItem
```
{
  id: UUID (primary key)
  order_id: UUID (foreign key → Order)
  product_id: UUID (foreign key → Product)
  variant_id: UUID (foreign key → ProductVariant, nullable)
  quantity: integer
  price: decimal
  created_at: timestamp
}
```

### Review
```
{
  id: UUID (primary key)
  product_id: UUID (foreign key → Product)
  user_id: UUID (foreign key → User)
  rating: integer (1-5)
  comment: text
  created_at: timestamp
  updated_at: timestamp
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: User Registration Creates Valid Account

*For any* valid email and password combination, registering a user SHALL result in a new user record in the database with the provided email and a hashed password.

**Validates: Requirements 1.1**

### Property 2: Invalid Registration Data Rejected

*For any* invalid registration data (malformed email, weak password, missing fields), the registration system SHALL reject the request and return a validation error without creating a user record.

**Validates: Requirements 1.2**

### Property 3: JWT Token Issued on Valid Login

*For any* registered user with correct credentials, the authentication system SHALL issue a valid JWT token that can be used for subsequent authenticated requests.

**Validates: Requirements 1.3**

### Property 4: Logout Invalidates Session

*For any* authenticated user, after logout, the invalidated JWT token SHALL be rejected on subsequent API requests.

**Validates: Requirements 1.4**

### Property 5: Authenticated User Dashboard Displays Data

*For any* authenticated user, the user dashboard SHALL display the user's profile information, address book, and order history.

**Validates: Requirements 1.5**

### Property 6: Profile Updates Persist

*For any* user profile update with valid data, the changes SHALL be persisted to the database and reflected on subsequent profile retrievals.

**Validates: Requirements 1.6**

### Property 7: Authentication Failure Returns Error

*For any* login attempt with invalid credentials, the authentication system SHALL return an appropriate error message without issuing a token.

**Validates: Requirements 1.7**

### Property 8: Home Page Displays Required Content

*For any* user visiting the home page, the page SHALL display a hero banner, popular products, and recommendations.

**Validates: Requirements 2.1**

### Property 9: Search Returns Relevant Results

*For any* search query, the search system SHALL return products matching the query with product images and details.

**Validates: Requirements 2.2**

### Property 10: Product Page Shows Complete Information

*For any* product with variants, the product page SHALL display product images, details, available variants with inventory status, and reviews.

**Validates: Requirements 2.3, 2.4**

### Property 11: Out of Stock Products Clearly Marked

*For any* product with zero inventory, the product display SHALL clearly indicate the unavailable status.

**Validates: Requirements 2.6**

### Property 12: Cart Item Addition Increases Count

*For any* product added to cart, the cart item count SHALL increase by one and the item SHALL be retrievable from the cart.

**Validates: Requirements 3.1**

### Property 13: Cart Totals Calculated Correctly

*For any* cart with items, the subtotal SHALL equal the sum of (item price × quantity) for all items.

**Validates: Requirements 3.2**

### Property 14: Quantity Update Recalculates Totals

*For any* cart item quantity update, the cart totals SHALL be recalculated and inventory checks SHALL be performed.

**Validates: Requirements 3.3**

### Property 15: Item Removal Updates Cart

*For any* item removed from cart, the item SHALL no longer appear in the cart and totals SHALL be updated.

**Validates: Requirements 3.4**

### Property 16: Cart Persists Across Sessions

*For any* authenticated user with items in cart, closing and reopening the browser SHALL preserve the cart contents.

**Validates: Requirements 3.5**

### Property 17: Unavailable Items Removed from Cart

*For any* item in cart that becomes unavailable, the system SHALL notify the user and remove the item from the cart.

**Validates: Requirements 3.6**

### Property 18: Checkout Displays Required Information

*For any* user proceeding to checkout, the checkout page SHALL display cart overview, delivery information form, and shipping options.

**Validates: Requirements 4.1**

### Property 19: Shipping Options Fetched from APIs

*For any* checkout with available delivery APIs, the shipping calculator SHALL fetch real-time pricing from DHL, PostNord, and DB Schenker.

**Validates: Requirements 4.2**

### Property 20: Shipping Cost Updates Order Total

*For any* shipping method selection, the order total SHALL be updated to include the selected shipping cost.

**Validates: Requirements 4.3**

### Property 21: Payment Processing Complies with PCI DSS

*For any* payment transaction, the Stripe integration SHALL process payment without storing credit card data locally.

**Validates: Requirements 4.4**

### Property 22: Successful Payment Creates Order

*For any* successful payment, the order system SHALL create an order record and send a confirmation email.

**Validates: Requirements 4.5**

### Property 23: Payment Failure Allows Retry

*For any* failed payment, the checkout system SHALL display an error message and allow the user to retry payment.

**Validates: Requirements 4.6**

### Property 24: Guest Checkout Enabled

*For any* guest user, the checkout system SHALL allow purchase without requiring account creation.

**Validates: Requirements 4.7**

### Property 25: Order Number Uniqueness

*For any* order created, the order system SHALL generate a unique order number.

**Validates: Requirements 5.1**

### Property 26: Order Status Updates Provided

*For any* order in processing, the order tracker SHALL provide status updates (confirmed, shipped, delivered).

**Validates: Requirements 5.2**

### Property 27: Real-Time Tracking Information

*For any* order with integrated delivery APIs, the tracking system SHALL fetch real-time tracking information.

**Validates: Requirements 5.3**

### Property 28: Order History Displays All Orders

*For any* user viewing order history, the dashboard SHALL display all past orders with status and details.

**Validates: Requirements 5.4**

### Property 29: Delivered Order Triggers Survey

*For any* order marked as delivered, the system SHALL trigger a customer satisfaction survey.

**Validates: Requirements 5.5**

### Property 30: Database Schema Includes Required Tables

*For any* database initialization, the schema SHALL include tables for users, addresses, products, product_images, product_variants, orders, and order_items.

**Validates: Requirements 6.1**

### Property 31: Parameterized Queries Prevent SQL Injection

*For any* database operation, the Turso client SHALL use parameterized queries to prevent SQL injection attacks.

**Validates: Requirements 6.2**

### Property 32: Foreign Key Relationships Enforced

*For any* database operation, foreign key relationships SHALL be enforced to maintain referential integrity.

**Validates: Requirements 6.3**

### Property 33: Product Queries Efficient with Variants

*For any* product query, the product repository SHALL efficiently retrieve products with variants and images.

**Validates: Requirements 6.4**

### Property 34: Data Validation on Frontend and Backend

*For any* user input, data validation SHALL occur on both frontend and backend.

**Validates: Requirements 6.5**

### Property 35: Credit Card Data Never Stored

*For any* payment transaction, the payment system SHALL never store credit card information locally.

**Validates: Requirements 7.1**

### Property 36: JWT Tokens Have Expiration

*For any* JWT token issued, the token SHALL have an appropriate expiration time.

**Validates: Requirements 7.2**

### Property 37: Input Sanitization Prevents Injection

*For any* user input accepted, the input validator SHALL sanitize and validate data to prevent injection attacks.

**Validates: Requirements 7.3**

### Property 38: Database Access Uses Parameterized Queries

*For any* database access, the database client SHALL use parameterized queries exclusively.

**Validates: Requirements 7.4**

### Property 39: HTTPS Enforced for All Communications

*For any* communication with the platform, the system SHALL implement HTTPS.

**Validates: Requirements 7.5**

### Property 40: Sensitive Data Encrypted at Rest

*For any* sensitive data stored, the encryption system SHALL protect data at rest.

**Validates: Requirements 7.6**

### Property 41: Header Component Displays Required Elements

*For any* page load, the header component SHALL display logo, main menu, search box, user links, and shopping cart icon.

**Validates: Requirements 8.1**

### Property 42: Footer Component Displays Required Information

*For any* page scroll, the footer component SHALL display links, contact info, delivery info, payment logos, social media, and newsletter signup.

**Validates: Requirements 8.2**

### Property 43: Image Gallery Provides Zoom Functionality

*For any* product with images, the image gallery SHALL provide zoom and multiple view options.

**Validates: Requirements 8.3**

### Property 44: Responsive Design Adapts to Mobile

*For any* mobile device access, the responsive design SHALL adapt layout for optimal viewing.

**Validates: Requirements 8.4**

### Property 45: UI Components Use Tailwind CSS

*For any* UI component, styling SHALL use Tailwind CSS for consistency.

**Validates: Requirements 8.5**

### Property 46: State Management Uses Zustand/Jotai

*For any* state management need, the system SHALL use Zustand or Jotai for shopping cart and user session.

**Validates: Requirements 8.6**

### Property 47: Backend Routing Follows REST Conventions

*For any* API request, the backend server SHALL handle routing with appropriate HTTP methods following REST conventions.

**Validates: Requirements 9.1, 9.5**

### Property 48: External API Errors Handled Gracefully

*For any* external API call, the integration layer SHALL handle errors and timeouts gracefully.

**Validates: Requirements 9.2**

### Property 49: Stripe Communication Secure

*For any* payment processing, the Stripe client SHALL securely communicate with Stripe API.

**Validates: Requirements 9.3**

### Property 50: Delivery APIs Called for Shipping

*For any* shipping calculation, the shipping service SHALL call DHL, PostNord, and DB Schenker APIs.

**Validates: Requirements 9.4**

### Property 51: Error Responses Consistent

*For any* error occurrence, the error handler SHALL return consistent error responses with appropriate status codes.

**Validates: Requirements 9.6**

### Property 52: Unit Tests Cover Business Logic

*For any* code change, the test suite SHALL include unit tests for core business logic.

**Validates: Requirements 10.1**

### Property 53: Integration Tests Cover Frontend-Backend

*For any* user interaction, the test suite SHALL include integration tests for frontend-backend communication.

**Validates: Requirements 10.2**

### Property 54: Payment Testing Uses Stripe Test Mode

*For any* payment processing test, the test environment SHALL use Stripe test mode with mock responses.

**Validates: Requirements 10.3**

### Property 55: Database Tests Verify Integrity

*For any* database operation, the test suite SHALL include tests for data integrity and relationships.

**Validates: Requirements 10.4**

### Property 56: Property-Based Tests Validate Correctness

*For any* valid input, property-based tests SHALL validate universal correctness properties across all inputs.

**Validates: Requirements 10.5**

## Error Handling

### Authentication Errors
- Invalid credentials: Return 401 Unauthorized with message "Invalid email or password"
- Expired token: Return 401 Unauthorized with message "Token expired, please login again"
- Missing token: Return 401 Unauthorized with message "Authorization required"
- Invalid token format: Return 401 Unauthorized with message "Invalid token"

### Validation Errors
- Invalid email format: Return 400 Bad Request with field-specific error
- Weak password: Return 400 Bad Request with password requirements
- Missing required fields: Return 400 Bad Request listing missing fields
- Invalid product variant: Return 400 Bad Request with available variants

### Business Logic Errors
- Insufficient inventory: Return 409 Conflict with available quantity
- Product not found: Return 404 Not Found
- Cart item not found: Return 404 Not Found
- Order not found: Return 404 Not Found

### External API Errors
- Shipping API timeout: Return 503 Service Unavailable with fallback shipping options
- Stripe API error: Return 502 Bad Gateway with retry instruction
- Payment declined: Return 402 Payment Required with decline reason

### Database Errors
- Connection failure: Return 500 Internal Server Error with retry instruction
- Query timeout: Return 504 Gateway Timeout
- Constraint violation: Return 409 Conflict with specific constraint information

## Testing Strategy

### Unit Testing
- Test authentication service (registration, login, token validation)
- Test product service (search, filtering, variant retrieval)
- Test cart service (add, remove, update, calculations)
- Test order service (creation, status updates)
- Test payment service (Stripe integration, error handling)
- Test shipping service (API calls, fallback handling)
- Test data validation functions
- Test utility functions and helpers

### Integration Testing
- Test complete checkout flow (cart → payment → order)
- Test user authentication flow (registration → login → dashboard)
- Test product browsing flow (search → product page → add to cart)
- Test order tracking flow (order creation → status updates → tracking)
- Test API endpoint interactions
- Test database operations with real schema

### Property-Based Testing
- Each correctness property SHALL be implemented as a separate property-based test
- Minimum 100 iterations per property test
- Each test SHALL be tagged with: **Feature: ecommerce-platform, Property {number}: {property_text}**
- Use fast-check (JavaScript) or equivalent for property generation
- Generate realistic test data (valid emails, product IDs, quantities, etc.)
- Test both success and failure paths

### Test Coverage Goals
- Core business logic: 90%+ coverage
- API endpoints: 85%+ coverage
- Database operations: 90%+ coverage
- Authentication and security: 95%+ coverage
- External integrations: 80%+ coverage (with mocks)

### Testing Tools
- Unit testing: Jest or Vitest
- Integration testing: Supertest (for API testing)
- Property-based testing: fast-check
- Database testing: Test database with migrations
- Mocking: Jest mocks for external APIs
